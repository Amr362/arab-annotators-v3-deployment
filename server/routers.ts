import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNull, ne } from "drizzle-orm";
import * as db from "./db";
import { users, projects, tasks, annotations, qaReviews, statistics, notifications, taskSkips } from "../drizzle/schema";
import { assignNextTask, startTask, submitTask } from "./workers/distributionWorker";
import { managerRouter } from "./managerRouter";
import { consumeSkip, getSkipStatus } from "./skipRateLimiter";
import { transition } from "./workers/stateMachine";
import { processSubmittedTask } from "./workers/qaSamplingWorker";
import { setHoneyPot } from "./workers/honeypotChecker";
import { recomputeMetrics } from "./workers/statsWorker";
import { computeIAAForProject } from "./workers/iaaWorker";

// Helper to ensure admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  manager: managerRouter,
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
          name: z.string().min(1),
          description: z.string().optional(),
          tasksText: z.string().nullish(),
          taskContents: z.array(z.string()).nullish(),
          annotationType: z.string().optional(),
          labelsConfig: z.unknown().optional(),
          instructions: z.string().optional(),
          minAnnotations: z.number().optional(),
          aiPreAnnotation: z.boolean().optional(),
          qaAiEnabled: z.boolean().optional(),
          spamDetection: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const taskContents = input.taskContents?.length
          ? input.taskContents
          : (input.tasksText ?? "").split("\n").map(s => s.trim()).filter(Boolean);

        try {
          const result = await db.createProjectWithTasks({
            name: input.name,
            description: input.description,
            createdBy: ctx.user.id,
            taskContents: taskContents.length > 0 ? taskContents : undefined,
          });

          const projectId = result?.id;

          if (projectId) {
            const drizzleDb = await db.getDb();
            if (drizzleDb) {
              await drizzleDb.update(projects).set({
                annotationType: input.annotationType ?? "classification",
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

          return await db.getProjectById(projectId);
        } catch (error: any) {
          console.error("[createProject] error:", error?.message ?? error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "فشل إنشاء المشروع" });
        }
      }),

    // Update project status (admin only)
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["active", "paused", "completed"]),
      }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await drizzleDb.update(projects)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(projects.id, input.id));
        return { success: true };
      }),

    // Update project info (admin only)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        await drizzleDb.update(projects).set(updates).where(eq(projects.id, input.id));
        return await db.getProjectById(input.id);
      }),

    // Delete project and all its tasks (admin only)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        try {
          // Delete annotations linked to tasks
          const projectTasks = await drizzleDb.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, input.id));
          const taskIds = projectTasks.map(t => t.id);
          if (taskIds.length > 0) {
            for (const tid of taskIds) {
              await drizzleDb.delete(annotations).where(eq(annotations.taskId, tid));
            }
            await drizzleDb.delete(tasks).where(eq(tasks.projectId, input.id));
          }
          await drizzleDb.delete(projects).where(eq(projects.id, input.id));
          return { success: true };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "فشل حذف المشروع" });
        }
      }),

    // Get task stats for a project (per-status counts + paginated task list)
    getDataset: adminProcedure
      .input(z.object({
        projectId: z.number(),
        limit: z.number().default(100),
        offset: z.number().default(0),
        statusFilter: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Count per status
        const allTasks = await drizzleDb.select({
          id: tasks.id,
          content: tasks.content,
          status: tasks.status,
          assignedTo: tasks.assignedTo,
          isGroundTruth: tasks.isGroundTruth,
          createdAt: tasks.createdAt,
        }).from(tasks).where(eq(tasks.projectId, input.projectId));

        const statusCounts = {
          total: allTasks.length,
          pending: allTasks.filter(t => t.status === "pending").length,
          in_progress: allTasks.filter(t => t.status === "in_progress").length,
          submitted: allTasks.filter(t => t.status === "submitted").length,
          approved: allTasks.filter(t => t.status === "approved").length,
          rejected: allTasks.filter(t => t.status === "rejected").length,
        };

        // Filter and paginate
        let filtered = allTasks;
        if (input.statusFilter && input.statusFilter !== "all") {
          filtered = allTasks.filter(t => t.status === input.statusFilter);
        }
        const paginated = filtered.slice(input.offset, input.offset + input.limit);

        // Get assignee names for the page
        const assigneeIds = [...new Set(paginated.map(t => t.assignedTo).filter(Boolean))] as number[];
        const assigneeMap: Record<number, string> = {};
        for (const uid of assigneeIds) {
          const u = await db.getUserById(uid);
          if (u) assigneeMap[uid] = u.name ?? String(uid);
        }

        return {
          statusCounts,
          tasks: paginated.map(t => ({
            ...t,
            assigneeName: t.assignedTo ? (assigneeMap[t.assignedTo] ?? String(t.assignedTo)) : null,
          })),
          total: filtered.length,
        };
      }),

    // Add more tasks to an existing project
    addTasks: adminProcedure
      .input(z.object({
        projectId: z.number(),
        tasksText: z.string(),
      }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const taskContents = input.tasksText.split("\n").map(s => s.trim()).filter(Boolean);
        if (!taskContents.length) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد مهام للإضافة" });

        await drizzleDb.insert(tasks).values(
          taskContents.map(content => ({ projectId: input.projectId, content }))
        );
        // Update totalItems count
        await drizzleDb.update(projects)
          .set({ totalItems: (await drizzleDb.select({ c: tasks.id }).from(tasks).where(eq(tasks.projectId, input.projectId))).length, updatedAt: new Date() })
          .where(eq(projects.id, input.projectId));

        return { added: taskContents.length };
      }),

    // Delete a single task
    deleteTask: adminProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await drizzleDb.delete(annotations).where(eq(annotations.taskId, input.taskId));
        await drizzleDb.delete(tasks).where(eq(tasks.id, input.taskId));
        return { success: true };
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
    // Get all active projects for tasker to see available work
    getAvailableProjects: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Return only active projects
      const allProjects = await db.getAllProjects();
      return allProjects.filter(p => p.status === "active");
    }),

    getTasks: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTasksByAssignee(ctx.user.id);
    }),

    // ── v4: Queue-based task assignment via DistributionWorker ─────────────────
    // Uses the TaskStateMachine and skill-level matching.
    // Replaces the old inline implementation.
    getNextTask: protectedProcedure
      .input(z.object({ projectId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "tasker" && ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await assignNextTask(ctx.user.id, input.projectId);
      }),

    // ── v4: Mark task as IN_PROGRESS (worker opened it) ──────────────────────
    startTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await startTask(input.taskId, ctx.user.id);
        return { success: true };
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTaskerStats(ctx.user.id);
    }),

    // Submit annotation for a task (v4: uses state machine + triggers QA sampling)
    submitAnnotation: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        result: z.unknown(),
        timeSpentSeconds: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        try {
          const drizzleDb = await db.getDb();
          if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

          // Upsert the annotation (non-draft)
          const existing = await drizzleDb
            .select({ id: annotations.id })
            .from(annotations)
            .where(and(eq(annotations.taskId, input.taskId), eq(annotations.userId, ctx.user.id)))
            .limit(1);

          if (existing.length) {
            await drizzleDb.update(annotations).set({
              result: input.result as any,
              isDraft: false,
              submittedAt: new Date(),
              timeSpentSeconds: input.timeSpentSeconds ?? 0,
              updatedAt: new Date(),
            }).where(eq(annotations.id, existing[0].id));
          } else {
            await drizzleDb.insert(annotations).values({
              taskId: input.taskId,
              userId: ctx.user.id,
              result: input.result as any,
              isDraft: false,
              submittedAt: new Date(),
              timeSpentSeconds: input.timeSpentSeconds ?? 0,
              status: "pending_review",
            });
          }

          // Transition task: IN_PROGRESS → SUBMITTED via state machine
          await submitTask(input.taskId, ctx.user.id);

          // Trigger QA sampling asynchronously (fire-and-forget)
          processSubmittedTask(input.taskId).catch(e =>
            console.error("[submitAnnotation] QA sampling error:", e)
          );

          return { success: true };
        } catch (error: any) {
          if (error?.code === "BAD_REQUEST") throw error;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل في تسليم المهمة" });
        }
      }),

    // Get QA feedback on submitted annotations
    getFeedback: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // v4: enrich feedback with honey pot check results
      const baseFeedback = await db.getTaskerFeedback(ctx.user.id);
      const drizzleDb = await db.getDb();
      if (!drizzleDb || !baseFeedback?.length) return baseFeedback ?? [];

      const { eq: eqOp, and: andOp } = await import("drizzle-orm");
      return Promise.all(baseFeedback.map(async (f: any) => {
        if (!f.taskId) return f;
        const annRows = await drizzleDb
          .select({ isHoneyPotCheck: annotations.isHoneyPotCheck, honeyPotPassed: annotations.honeyPotPassed })
          .from(annotations)
          .where(andOp(eqOp(annotations.taskId, f.taskId), eqOp(annotations.userId, ctx.user.id)))
          .limit(1);
        const ann = annRows[0];
        return {
          ...f,
          isHoneyPotCheck: ann?.isHoneyPotCheck ?? false,
          honeyPotPassed: ann?.honeyPotPassed ?? null,
        };
      }));
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
        // Accept either raw text (one per line) OR a pre-parsed array from file upload
        tasksText: z.string().nullish(),
        taskContents: z.array(z.string()).nullish(),
        annotationType: z.string().optional(),
        labelsConfig: z.unknown().optional(),
        instructions: z.string().optional(),
        minAnnotations: z.number().optional(),
        aiPreAnnotation: z.boolean().optional(),
        qaAiEnabled: z.boolean().optional(),
        spamDetection: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // taskContents from file upload takes priority; fall back to line-split text
        const taskContents = input.taskContents?.length
          ? input.taskContents
          : (input.tasksText ?? "").split("\n").map(s => s.trim()).filter(Boolean);

        if (taskContents.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد مهام للاستيراد" });
        }

        try {
          const result = await db.createProjectWithTasks({
            name: input.name,
            description: input.description,
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

  // ── Admin stats ─────────────────────────────────────────────────────────────
  adminStats: router({
    get: adminProcedure.query(async () => {
      return await db.getAdminStats();
    }),
  }),

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  leaderboard: router({
    get: adminProcedure.query(async () => {
      return await db.getLeaderboard();
    }),
  }),

  // ── Export ──────────────────────────────────────────────────────────────────
  export: router({
    // Raw annotation rows — client converts to any format (CSV / JSON / JSONL / XLSX)
    projectAnnotations: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return [];
        const rows = await drizzleDb
          .select({
            taskId: tasks.id,
            content: tasks.content,
            annotationResult: annotations.result,
            annotatorName: users.name,
            annotatorId: users.id,
            status: annotations.status,
            qaStatus: qaReviews.status,
            qaFeedback: qaReviews.feedback,
            timeSpentSeconds: annotations.timeSpentSeconds,
            confidence: annotations.confidence,
            isDraft: annotations.isDraft,
            createdAt: annotations.createdAt,
            updatedAt: annotations.updatedAt,
          })
          .from(annotations)
          .innerJoin(tasks, eq(annotations.taskId, tasks.id))
          .innerJoin(users, eq(annotations.userId, users.id))
          .leftJoin(qaReviews, eq(qaReviews.annotationId, annotations.id))
          .where(and(eq(tasks.projectId, input.projectId), eq(annotations.isDraft, false)));
        return rows;
      }),

    // Export the raw task dataset (no annotations required) — useful for re-import
    projectDataset: adminProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return [];
        return drizzleDb
          .select({ id: tasks.id, content: tasks.content, status: tasks.status, isGroundTruth: tasks.isGroundTruth, groundTruthResult: tasks.groundTruthResult, createdAt: tasks.createdAt })
          .from(tasks)
          .where(eq(tasks.projectId, input.projectId));
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

  // ── v4: Worker Metrics ────────────────────────────────────────────────────
  workerMetrics: router({
    getForProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return [];
        const { workerMetrics: wm } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        return drizzleDb
          .select()
          .from(wm)
          .where(eqOp(wm.projectId, input.projectId));
      }),

    getForWorker: protectedProcedure.query(async ({ ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      const { workerMetrics: wm } = await import("../drizzle/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      return drizzleDb
        .select()
        .from(wm)
        .where(eqOp(wm.userId, ctx.user.id));
    }),

    triggerRecompute: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await recomputeMetrics();
      return { success: true };
    }),
  }),

  // ── v4: IAA Scores ────────────────────────────────────────────────────────
  iaa: router({
    getForProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return [];
        const { iaaScores } = await import("../drizzle/schema");
        const { eq: eqOp, desc: descOp } = await import("drizzle-orm");
        return drizzleDb
          .select()
          .from(iaaScores)
          .where(eqOp(iaaScores.projectId, input.projectId))
          .orderBy(descOp(iaaScores.computedAt));
      }),

    triggerCompute: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await computeIAAForProject(input.projectId);
        return { success: true };
      }),
  }),

  // ── v4: Honey Pot management ──────────────────────────────────────────────
  honeyPot: router({
    setTask: protectedProcedure
      .input(z.object({ taskId: z.number(), answer: z.unknown() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await setHoneyPot(input.taskId, input.answer);
        return { success: true };
      }),
  }),

  // ── v4: Batches ───────────────────────────────────────────────────────────
  batches: router({
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().min(1),
        honeyPotRate: z.number().min(0).max(1).default(0.05),
        qaRate: z.number().min(0).max(1).default(0.20),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { batches } = await import("../drizzle/schema");
        const [batch] = await drizzleDb.insert(batches).values({
          projectId: input.projectId,
          name: input.name,
          honeyPotRate: input.honeyPotRate.toFixed(2),
          qaRate: input.qaRate.toFixed(2),
          createdBy: ctx.user.id,
        }).returning();
        return batch;
      }),

    getForProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return [];
        const { batches } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        return drizzleDb.select().from(batches).where(eqOp(batches.projectId, input.projectId));
      }),
  }),

  // ── v4: Project Assignments (manager-driven team management) ─────────────
  projectAssignments: router({
    assign: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        userId: z.number(),
        role: z.enum(["tasker", "qa", "manager"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { projectAssignments } = await import("../drizzle/schema");
        await drizzleDb.insert(projectAssignments).values({
          projectId: input.projectId,
          userId: input.userId,
          role: input.role,
        }).onConflictDoUpdate({
          target: [projectAssignments.projectId, projectAssignments.userId],
          set: { role: input.role, isActive: true },
        });
        return { success: true };
      }),

    getForProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) return [];
        const { projectAssignments } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        return drizzleDb
          .select()
          .from(projectAssignments)
          .where(eqOp(projectAssignments.projectId, input.projectId));
      }),

    remove: protectedProcedure
      .input(z.object({ projectId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { projectAssignments } = await import("../drizzle/schema");
        const { and: andOp, eq: eqOp } = await import("drizzle-orm");
        await drizzleDb.delete(projectAssignments).where(
          andOp(
            eqOp(projectAssignments.projectId, input.projectId),
            eqOp(projectAssignments.userId, input.userId)
          )
        );
        return { success: true };
      }),
  }),

  // ── v4: QA transitions (manager/QA) ─────────────────────────────────────
  qaActions: router({
    approve: protectedProcedure
      .input(z.object({ taskId: z.number(), annotationId: z.number(), feedback: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "qa" && ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await transition({ taskId: input.taskId, to: "APPROVED", actorId: ctx.user.id, reason: "QA approved" });

        await drizzleDb.update(annotations)
          .set({ status: "approved", updatedAt: new Date() })
          .where(eq(annotations.id, input.annotationId));

        await drizzleDb.insert(qaReviews).values({
          annotationId: input.annotationId,
          reviewerId: ctx.user.id,
          status: "approved",
          feedback: input.feedback ?? "✓ مقبول",
        });

        return { success: true };
      }),

    reject: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        annotationId: z.number(),
        feedback: z.string().min(1, "يجب إضافة ملاحظة عند الرفض"),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "qa" && ctx.user.role !== "admin" && ctx.user.role !== "manager") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // REJECTED → ASSIGNED (task re-enters pool)
        await transition({ taskId: input.taskId, to: "REJECTED", actorId: ctx.user.id, reason: input.feedback });
        await transition({ taskId: input.taskId, to: "ASSIGNED", actorId: ctx.user.id, reason: "re-queued after rejection" });

        await drizzleDb.update(annotations)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(eq(annotations.id, input.annotationId));

        await drizzleDb.insert(qaReviews).values({
          annotationId: input.annotationId,
          reviewerId: ctx.user.id,
          status: "rejected",
          feedback: input.feedback,
        });

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
