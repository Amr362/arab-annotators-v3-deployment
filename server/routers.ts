import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNull, ne } from "drizzle-orm";
import * as db from "./db";
import { users, projects, tasks, annotations, qaReviews, statistics, notifications, taskSkips } from "../drizzle/schema";

// Helper to ensure admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Admin procedures for user management
  admin: router({
    // Get all users
    getAllUsers: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // Get user by ID
    getUser: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getUserById(input.id);
    }),

    // Create new user (local, not OAuth) — server generates openId
    createUser: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(["admin", "tasker", "qa", "user"]),
          password: z.string().min(6),
        })
      )
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Server generates a unique openId — never accept it from client
        const { randomUUID } = await import("crypto");
        const openId = `local_${randomUUID()}`;
        const passwordHash = await db.hashPassword(input.password);

        try {
          await drizzleDb.insert(users).values({
            openId,
            name: input.name,
            email: input.email.trim().toLowerCase(),
            role: input.role,
            loginMethod: "local",
            passwordHash,
            isActive: true,
          });

          const result = await db.getUserByOpenId(openId);
          // Return user + plain password so admin can share credentials
          return { ...result, plainPassword: input.password };
        } catch (error: any) {
          if (error?.code === "23505") {
            throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مستخدم مسبقاً" });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في إنشاء المستخدم" });
        }
      }),

    // Bulk create users
    bulkCreateUsers: adminProcedure
      .input(z.object({
        count: z.number().min(1).max(50),
        role: z.enum(["tasker", "qa"]),
        prefix: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { randomUUID } = await import("crypto");
        const created = [];
        const prefix = input.prefix ?? input.role;

        for (let i = 1; i <= input.count; i++) {
          const openId = `local_${randomUUID()}`;
          const name = `${prefix}_${String(i).padStart(2, "0")}`;
          const password = Math.random().toString(36).slice(2, 10);
          const passwordHash = await db.hashPassword(password);

          await drizzleDb.insert(users).values({
            openId,
            name,
            email: `${name}@annotators.local`,
            role: input.role,
            loginMethod: "local",
            passwordHash,
            isActive: true,
          });

          created.push({ name, email: `${name}@annotators.local`, password, role: input.role });
        }

        return { created };
      }),

    // Update user — proper undefined checks so empty strings are accepted
    updateUser: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          email: z.string().email().optional(),
          role: z.enum(["admin", "tasker", "qa", "user"]).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) updates.name = input.name;
        if (input.email !== undefined) updates.email = input.email;
        if (input.role !== undefined) updates.role = input.role;
        if (input.isActive !== undefined) updates.isActive = input.isActive;

        try {
          await drizzleDb.update(users).set(updates).where(eq(users.id, input.id));
          return await db.getUserById(input.id);
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في تحديث المستخدم" });
        }
      }),

    // Delete user
    deleteUser: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        await drizzleDb.delete(users).where(eq(users.id, input.id));
        return { success: true };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في حذف المستخدم" });
      }
    }),
  }),

  // Project procedures
  projects: router({
    // Get all projects
    getAll: protectedProcedure.query(async () => {
      return await db.getAllProjects();
    }),

    // Get project by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getProjectById(input.id);
    }),

    // Create project (admin only)
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          labelStudioProjectId: z.number(),
          totalItems: z.number().default(0),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        try {
          const [inserted] = await drizzleDb
            .insert(projects)
            .values({
              name: input.name,
              description: input.description,
              labelStudioProjectId: input.labelStudioProjectId,
              totalItems: input.totalItems,
              createdBy: ctx.user.id,
            })
            .returning();

          return await db.getProjectById(inserted.id);
        } catch (error: any) {
          console.error("[createProject] error:", error?.message ?? error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "Failed to create project" });
        }
      }),
  }),

  // Task procedures
  tasks: router({
    // Get tasks for a project
    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTasksByProject(input.projectId);
      }),

    // Get task by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getTaskById(input.id);
    }),
  }),

  // Statistics procedures
  statistics: router({
    // Get project statistics
    getProjectStats: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getStatisticsByProject(input.projectId);
      }),
  }),

  // Notifications procedures
  notifications: router({
    getByUser: protectedProcedure.query(async ({ ctx }) => {
      return await db.getNotificationsByUser(ctx.user.id);
    }),
    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
      return { count: await db.getUnreadNotificationCount(ctx.user.id) };
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        return await db.markNotificationRead(input.id, ctx.user.id);
      }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      return await db.markAllNotificationsRead(ctx.user.id);
    }),
  }),

  // Tasker procedures
  tasker: router({
    getTasks: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTasksByAssignee(ctx.user.id);
    }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTaskerStats(ctx.user.id);
    }),

    // Submit annotation for a task
    submitAnnotation: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        result: z.unknown(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        try {
          return await db.submitTaskAnnotation(input.taskId, ctx.user.id, input.result);
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في تسليم المهمة" });
        }
      }),

    // Get QA feedback on submitted annotations
    getFeedback: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTaskerFeedback(ctx.user.id);
    }),
  }),

  // QA procedures
  qa: router({
    getQueue: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "qa" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getQAQueue(ctx.user.id);
    }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "qa" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getQAStats(ctx.user.id);
    }),

    // Approve an annotation
    approve: protectedProcedure
      .input(z.object({ annotationId: z.number(), feedback: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "qa" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        try {
          await db.approveAnnotation(input.annotationId, ctx.user.id, input.feedback);
          return { success: true };
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في قبول التوسيم" });
        }
      }),

    // Reject an annotation
    reject: protectedProcedure
      .input(z.object({ annotationId: z.number(), feedback: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "qa" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        try {
          await db.rejectAnnotation(input.annotationId, ctx.user.id, input.feedback);
          return { success: true };
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في رفض التوسيم" });
        }
      }),
  }),

  // Export (admin only)
  export: router({
    projectAnnotations: adminProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.exportProjectAnnotations(input.projectId);
      }),
  }),

  // IAA — Inter-Annotator Agreement (admin + qa)
  iaa: router({
    cohenKappa: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "qa") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.computeCohenKappa(input.projectId);
      }),

    fleissKappa: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "qa") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.computeFleissKappa(input.projectId);
      }),
  }),

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  leaderboard: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "qa") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getLeaderboard();
    }),
  }),

  // ── Admin: Enhanced stats + project management + task assignment ─────────────
  adminStats: router({
    get: adminProcedure.query(async () => {
      return await db.getAdminStats();
    }),
  }),

  taskManagement: router({
    // Assign tasks to a user
    assignTasks: adminProcedure
      .input(z.object({ taskIds: z.array(z.number()), userId: z.number() }))
      .mutation(async ({ input }) => {
        try {
          return await db.assignTasksToUser(input.taskIds, input.userId);
        } catch (e) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل تعيين المهام" });
        }
      }),

    // Get unassigned tasks for a project
    getUnassigned: adminProcedure
      .input(z.object({ projectId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getUnassignedTasks(input.projectId, input.limit ?? 50);
      }),

    // Create project + bulk import tasks from text (one per line)
    createProjectWithTasks: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        labelStudioProjectId: z.number().optional(),
        tasksText: z.string(),
        annotationType: z.string().optional(),
        labelsConfig: z.unknown().optional(),
        instructions: z.string().optional(),
        minAnnotations: z.number().optional(),
        aiPreAnnotation: z.boolean().optional(),
        qaAiEnabled: z.boolean().optional(),
        spamDetection: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const taskContents = input.tasksText
          .split("\n")
          .map(s => s.trim())
          .filter(Boolean);

        if (taskContents.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد مهام للاستيراد" });
        }

        try {
          const result = await db.createProjectWithTasks({
            name: input.name,
            description: input.description,
            labelStudioProjectId: input.labelStudioProjectId,
            createdBy: ctx.user.id,
            taskContents,
          });

          // result is the inserted project object
          const projectId = result?.id;

          // Update annotation config if provided
          if (input.annotationType && projectId) {
            const drizzleDb = await db.getDb();
            if (drizzleDb) {
              await drizzleDb.update(projects).set({
                annotationType: input.annotationType,
                labelsConfig: input.labelsConfig as any ?? null,
                instructions: input.instructions ?? null,
                minAnnotations: input.minAnnotations ?? 1,
                aiPreAnnotation: input.aiPreAnnotation ?? false,
                qaAiEnabled: input.qaAiEnabled ?? false,
                spamDetection: input.spamDetection ?? false,
                updatedAt: new Date(),
              }).where(eq(projects.id, projectId));
            }
          }

          return { projectId, taskCount: taskContents.length, name: result?.name };
        } catch (e: any) {
          console.error("[createProjectWithTasks] error:", e?.message ?? e);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "فشل إنشاء المشروع" });
        }
      }),
  }),

  // ── Admin: Password management ────────────────────────────────────────────────
  passwordManagement: router({
    resetPassword: adminProcedure
      .input(z.object({ userId: z.number(), newPassword: z.string().min(6) }))
      .mutation(async ({ input }) => {
        try {
          return await db.resetUserPassword(input.userId, input.newPassword);
        } catch (e) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل إعادة تعيين كلمة المرور" });
        }
      }),
  }),

  // ── Skip task ────────────────────────────────────────────────────────────────
  taskSkip: router({
    skip: protectedProcedure
      .input(z.object({ taskId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await drizzleDb.insert(taskSkips).values({ taskId: input.taskId, userId: ctx.user.id, reason: input.reason });
        // Mark task back to pending so it can be reassigned
        await drizzleDb.update(tasks).set({ status: "pending", assignedTo: null, updatedAt: new Date() }).where(eq(tasks.id, input.taskId));
        return { success: true };
      }),

    getSkipped: protectedProcedure.query(async ({ ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return drizzleDb.select().from(taskSkips).where(eq(taskSkips.userId, ctx.user.id));
    }),
  }),

  // ── Draft (auto-save) ────────────────────────────────────────────────────────
  draft: router({
    save: protectedProcedure
      .input(z.object({ taskId: z.number(), result: z.unknown() }))
      .mutation(async ({ input, ctx }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Upsert draft annotation
        const existing = await drizzleDb
          .select({ id: annotations.id })
          .from(annotations)
          .where(and(eq(annotations.taskId, input.taskId), eq(annotations.userId, ctx.user.id), eq(annotations.isDraft, true)))
          .limit(1);
        if (existing.length) {
          await drizzleDb.update(annotations)
            .set({ result: input.result as any, updatedAt: new Date() })
            .where(eq(annotations.id, existing[0].id));
        } else {
          await drizzleDb.insert(annotations).values({
            taskId: input.taskId,
            userId: ctx.user.id,
            result: input.result as any,
            isDraft: true,
            status: "pending_review",
          });
          // Mark task in_progress
          await drizzleDb.update(tasks).set({ status: "in_progress", updatedAt: new Date() }).where(eq(tasks.id, input.taskId));
        }
        return { saved: true };
      }),

    get: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input, ctx }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return null;
        const rows = await drizzleDb
          .select()
          .from(annotations)
          .where(and(eq(annotations.taskId, input.taskId), eq(annotations.userId, ctx.user.id), eq(annotations.isDraft, true)))
          .limit(1);
        return rows[0] ?? null;
      }),
  }),

  // ── Ground truth ─────────────────────────────────────────────────────────────
  groundTruth: router({
    setTask: adminProcedure
      .input(z.object({ taskId: z.number(), result: z.unknown(), isGroundTruth: z.boolean() }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await drizzleDb.update(tasks)
          .set({
            isGroundTruth: input.isGroundTruth,
            groundTruthResult: input.isGroundTruth ? (input.result as any) : null,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId));
        return { success: true };
      }),

    getStats: adminProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Get ground truth tasks for this project
        const gtTasks = await drizzleDb
          .select()
          .from(tasks)
          .where(and(eq(tasks.projectId, input.projectId), eq(tasks.isGroundTruth, true)));

        if (!gtTasks.length) return { totalGT: 0, annotators: [] };

        const taskIds = gtTasks.map(t => t.id);
        const allAnnotations = await drizzleDb
          .select()
          .from(annotations)
          .where(and(eq(annotations.isDraft, false)));

        const filtered = allAnnotations.filter(a => taskIds.includes(a.taskId));

        // Group by user
        const byUser: Record<number, { correct: number; total: number }> = {};
        for (const ann of filtered) {
          if (!byUser[ann.userId]) byUser[ann.userId] = { correct: 0, total: 0 };
          const gt = gtTasks.find(t => t.id === ann.taskId);
          if (!gt) continue;
          byUser[ann.userId].total++;
          const gtRes = gt.groundTruthResult as any;
          const annRes = ann.result as any;
          // Simple label match
          const gtLabel = gtRes?.labels?.[0] ?? gtRes?.choice;
          const annLabel = annRes?.labels?.[0] ?? annRes?.choice;
          if (gtLabel && annLabel && gtLabel === annLabel) byUser[ann.userId].correct++;
        }

        const annotators = await Promise.all(
          Object.entries(byUser).map(async ([userId, stats]) => {
            const user = await db.getUserById(Number(userId));
            return { userId: Number(userId), name: user?.name ?? "—", ...stats, accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0 };
          })
        );

        return { totalGT: gtTasks.length, annotators };
      }),
  }),

  // ── AI pre-annotation ────────────────────────────────────────────────────────
  aiAnnotation: router({
    suggest: protectedProcedure
      .input(z.object({ taskId: z.number(), projectId: z.number() }))
      .query(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return null;

        // Check if project has AI enabled and get label config
        const project = await db.getProjectById(input.projectId);
        if (!project?.aiPreAnnotation) return null;

        const task = await db.getTaskById(input.taskId);
        if (!task) return null;

        const config = project.labelsConfig as any;
        const labels: string[] = config?.labels?.map((l: any) => l.value) ?? [];
        if (!labels.length) return null;

        // Call Gemini API for pre-annotation
        try {
          const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `صنّف النص التالي في أحد الأصناف: ${labels.join(", ")}\nالنص: "${task.content}"\nأجب بالصنف فقط بدون أي شرح.`
                }]
              }],
              generationConfig: {
                maxOutputTokens: 50,
                temperature: 0.1,
              }
            }),
          });
          const data = await response.json() as any;
          const suggestion = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          const matched = labels.find(l => suggestion?.includes(l));
          if (matched) return { labels: [matched], type: config?.type ?? "classification" };
        } catch (e) {
          console.error("[AI] Pre-annotation error:", e);
          return null;
        }
        return null;
      }),
  }),

  // ── Project labeling config ───────────────────────────────────────────────────
  projectConfig: router({
    get: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getProjectById(input.projectId);
      }),

    update: adminProcedure
      .input(z.object({
        projectId: z.number(),
        annotationType: z.string(),
        labelsConfig: z.unknown(),
        instructions: z.string().optional(),
        minAnnotations: z.number().optional(),
        aiPreAnnotation: z.boolean().optional(),
        qaAiEnabled: z.boolean().optional(),
        spamDetection: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await drizzleDb.update(projects)
          .set({
            annotationType: input.annotationType,
            labelsConfig: input.labelsConfig as any,
            instructions: input.instructions,
            minAnnotations: input.minAnnotations ?? 1,
            aiPreAnnotation: input.aiPreAnnotation ?? false,
            qaAiEnabled: input.qaAiEnabled ?? false,
            spamDetection: input.spamDetection ?? false,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, input.projectId));
        return { success: true };
      }),
  }),

  // ── AI tools for QA & Spam ──────────────────────────────────────────────────
  aiTools: router({
    // QA: AI review suggestion for a single annotation
    qaReview: protectedProcedure
      .input(z.object({ annotationId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "qa" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return null;

        const rows = await drizzleDb.select().from(annotations).where(eq(annotations.id, input.annotationId)).limit(1);
        const ann = rows[0];
        if (!ann) return null;

        const taskRows = await drizzleDb.select().from(tasks).where(eq(tasks.id, ann.taskId)).limit(1);
        const task = taskRows[0];
        if (!task) return null;

        const project = await db.getProjectById(task.projectId);
        if (!project?.qaAiEnabled) return null;

        const config = project.labelsConfig as any;
        const labels: string[] = config?.labels?.map((l: any) => l.value) ?? [];
        const annResult = ann.result as any;
        const annLabel = annResult?.labels?.[0] ?? annResult?.choice ?? JSON.stringify(annResult);

        try {
          const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `أنت مراجع جودة لمشروع توسيم نصوص عربية.
النص: "${task.content}"
التصنيفات المتاحة: ${labels.join("، ")}
تصنيف المُوسِّم: "${annLabel}"

هل التصنيف صحيح؟ أجب بـ JSON فقط بهذا الشكل:
{"verdict": "approve" | "reject" | "uncertain", "confidence": 0-100, "reason": "سبب قصير"}`
                }]
              }],
              generationConfig: {
                maxOutputTokens: 200,
                temperature: 0.1,
                responseMimeType: "application/json",
              }
            }),
          });
          const data = await response.json() as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          return JSON.parse(text);
        } catch (e) {
          console.error("[AI] QA Review error:", e);
          return null;
        }
      }),

    // Spam detection: check if annotation looks like random/spam
    spamCheck: protectedProcedure
      .input(z.object({ annotationId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "qa" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return null;

        const rows = await drizzleDb.select().from(annotations).where(eq(annotations.id, input.annotationId)).limit(1);
        const ann = rows[0];
        if (!ann) return null;

        const taskRows = await drizzleDb.select().from(tasks).where(eq(tasks.id, ann.taskId)).limit(1);
        const task = taskRows[0];
        if (!task) return null;

        const project = await db.getProjectById(task.projectId);
        if (!project?.spamDetection) return null;

        const annResult = ann.result as any;
        const annLabel = annResult?.labels?.[0] ?? annResult?.choice ?? "";
        const config = project.labelsConfig as any;
        const labels: string[] = config?.labels?.map((l: any) => l.value) ?? [];

        try {
          const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `هل التصنيف التالي يبدو عشوائياً أو غير جاد؟
النص: "${task.content}"
التصنيف المختار: "${annLabel}"
التصنيفات المتاحة: ${labels.join("، ")}

أجب بـ JSON فقط:
{"isSpam": true | false, "confidence": 0-100, "reason": "سبب قصير"}`
                }]
              }],
              generationConfig: {
                maxOutputTokens: 150,
                temperature: 0.1,
                responseMimeType: "application/json",
              }
            }),
          });
          const data = await response.json() as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          return JSON.parse(text);
        } catch (e) {
          console.error("[AI] Spam check error:", e);
          return null;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
