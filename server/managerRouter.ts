/**
 * Manager Router — v4
 * ────────────────────
 * All procedures accessible to role=manager (and admin).
 * Handles: project management, team assignments, batch control,
 *          QA queue overview, worker supervision, IAA triggers.
 *
 * Imported into routers.ts as appRouter.manager
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { router, managerProcedure } from "./_core/trpc";
import * as db from "./db";
import {
  users,
  projects,
  tasks,
  annotations,
  qaReviews,
  batches,
  workerMetrics,
  iaaScores,
  projectAssignments,
  taskTransitions,
} from "../drizzle/schema";
import { transition } from "./workers/stateMachine";
import { computeIAAForProject } from "./workers/iaaWorker";
import { recomputeMetrics } from "./workers/statsWorker";

export const managerRouter = router({

  // ── Dashboard overview ────────────────────────────────────────────────────

  /**
   * Full project dashboard: progress, throughput, worker leaderboard, QA stats
   */
  getDashboard: managerProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // Task status breakdown
      const allTasks = await drizzleDb
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.projectId, input.projectId));

      const statusCounts = allTasks.reduce((acc, t) => {
        const s = t.status ?? "CREATED";
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const total = allTasks.length;
      const approved = (statusCounts["APPROVED"] ?? 0) + (statusCounts["approved"] ?? 0);
      const inQa = (statusCounts["IN_QA"] ?? 0);
      const submitted = (statusCounts["SUBMITTED"] ?? 0) + (statusCounts["submitted"] ?? 0);
      const inProgress = (statusCounts["IN_PROGRESS"] ?? 0) + (statusCounts["in_progress"] ?? 0);
      const created = (statusCounts["CREATED"] ?? 0) + (statusCounts["pending"] ?? 0);

      // Throughput: annotations submitted in last 24h
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAnns = await drizzleDb
        .select({ c: sql<number>`count(*)` })
        .from(annotations)
        .innerJoin(tasks, eq(annotations.taskId, tasks.id))
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            eq(annotations.isDraft, false),
            sql`${annotations.createdAt} > ${yesterday}`
          )
        );
      const throughput24h = Number(recentAnns[0]?.c ?? 0);

      // Worker leaderboard from worker_metrics
      const metrics = await drizzleDb
        .select()
        .from(workerMetrics)
        .where(eq(workerMetrics.projectId, input.projectId))
        .orderBy(desc(workerMetrics.totalAnnotations));

      const leaderboard = await Promise.all(
        metrics.slice(0, 20).map(async m => {
          const user = await db.getUserById(m.userId);
          return {
            userId: m.userId,
            name: user?.name ?? `User #${m.userId}`,
            totalAnnotations: m.totalAnnotations,
            qaPassRate: Number(m.qaPassRate ?? 0),
            honeyPotAccuracy: Number(m.honeyPotAccuracy ?? 0),
            skillLevel: user?.skillLevel ?? 1,
            isSuspended: user?.isSuspended ?? false,
          };
        })
      );

      // QA metrics
      const qaRows = await drizzleDb
        .select({ status: qaReviews.status, c: sql<number>`count(*)` })
        .from(qaReviews)
        .innerJoin(annotations, eq(qaReviews.annotationId, annotations.id))
        .innerJoin(tasks, eq(annotations.taskId, tasks.id))
        .where(eq(tasks.projectId, input.projectId))
        .groupBy(qaReviews.status);

      const qaApproved = Number(qaRows.find(r => r.status === "approved")?.c ?? 0);
      const qaRejected = Number(qaRows.find(r => r.status === "rejected")?.c ?? 0);
      const qaTotal = qaApproved + qaRejected;

      // Latest IAA score
      const latestIAA = await drizzleDb
        .select()
        .from(iaaScores)
        .where(
          and(
            eq(iaaScores.projectId, input.projectId),
            sql`${iaaScores.annotator1Id} IS NULL` // project-level Fleiss kappa
          )
        )
        .orderBy(desc(iaaScores.computedAt))
        .limit(1);

      return {
        project,
        progress: { total, approved, inQa, submitted, inProgress, created },
        progressPct: total > 0 ? Math.round((approved / total) * 100) : 0,
        throughput24h,
        leaderboard,
        qa: {
          approved: qaApproved,
          rejected: qaRejected,
          total: qaTotal,
          passRate: qaTotal > 0 ? (qaApproved / qaTotal) : 0,
        },
        iaa: latestIAA[0] ?? null,
      };
    }),

  // ── Project management ────────────────────────────────────────────────────

  /** List all projects (manager sees all they're assigned to, admin sees all) */
  getProjects: managerProcedure.query(async ({ ctx }) => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return [];

    if (ctx.user.role === "admin") {
      return await db.getAllProjects();
    }

    // Managers see only assigned projects
    const assigned = await drizzleDb
      .select({ projectId: projectAssignments.projectId })
      .from(projectAssignments)
      .where(
        and(
          eq(projectAssignments.userId, ctx.user.id),
          eq(projectAssignments.isActive, true)
        )
      );

    const projectIds = assigned.map(a => a.projectId);
    if (!projectIds.length) return [];

    const allProjects = await db.getAllProjects();
    return allProjects.filter(p => projectIds.includes(p.id));
  }),

  /** Create a new project (manager can create — previously admin-only) */
  createProject: managerProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      annotationType: z.string().default("classification"),
      labelsConfig: z.unknown().optional(),
      instructions: z.string().optional(),
      minAnnotations: z.number().min(1).default(1),
      aiPreAnnotation: z.boolean().default(false),
      qaAiEnabled: z.boolean().default(false),
      spamDetection: z.boolean().default(false),
      tasksText: z.string().optional(),
      taskContents: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const taskContents = input.taskContents?.length
        ? input.taskContents
        : (input.tasksText ?? "").split("\n").map(s => s.trim()).filter(Boolean);

      const result = await db.createProjectWithTasks({
        name: input.name,
        description: input.description,
        createdBy: ctx.user.id,
        taskContents,
      });

      if (!result?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await drizzleDb.update(projects).set({
        annotationType: input.annotationType,
        labelsConfig: input.labelsConfig as any ?? null,
        instructions: input.instructions ?? null,
        minAnnotations: input.minAnnotations,
        aiPreAnnotation: input.aiPreAnnotation,
        qaAiEnabled: input.qaAiEnabled,
        spamDetection: input.spamDetection,
        updatedAt: new Date(),
      }).where(eq(projects.id, result.id));

      // Auto-assign manager to their own project
      await drizzleDb.insert(projectAssignments).values({
        projectId: result.id,
        userId: ctx.user.id,
        role: "manager",
      }).onConflictDoNothing();

      return { projectId: result.id, taskCount: taskContents.length, name: result.name };
    }),

  /** Update project status */
  updateProjectStatus: managerProcedure
    .input(z.object({
      projectId: z.number(),
      status: z.enum(["active", "paused", "completed"]),
    }))
    .mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await drizzleDb.update(projects)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));
      return { success: true };
    }),

  // ── Team management ───────────────────────────────────────────────────────

  /** Get all workers available to assign */
  getAvailableWorkers: managerProcedure.query(async () => {
    const allUsers = await db.getAllUsers();
    return allUsers.filter(u =>
      (u.role === "tasker" || u.role === "qa") && u.isActive
    );
  }),

  /** Assign a worker to a project */
  assignWorker: managerProcedure
    .input(z.object({
      projectId: z.number(),
      userId: z.number(),
      role: z.enum(["tasker", "qa"]),
    }))
    .mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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

  /** Remove worker from a project */
  removeWorker: managerProcedure
    .input(z.object({ projectId: z.number(), userId: z.number() }))
    .mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await drizzleDb.update(projectAssignments)
        .set({ isActive: false })
        .where(
          and(
            eq(projectAssignments.projectId, input.projectId),
            eq(projectAssignments.userId, input.userId)
          )
        );
      return { success: true };
    }),

  /** Get project team */
  getTeam: managerProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      const assignments = await drizzleDb
        .select()
        .from(projectAssignments)
        .where(
          and(
            eq(projectAssignments.projectId, input.projectId),
            eq(projectAssignments.isActive, true)
          )
        );
      return Promise.all(assignments.map(async a => {
        const user = await db.getUserById(a.userId);
        return { ...a, user };
      }));
    }),

  // ── Worker supervision ────────────────────────────────────────────────────

  /** Get all worker metrics for a project */
  getWorkerMetrics: managerProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      const metrics = await drizzleDb
        .select()
        .from(workerMetrics)
        .where(eq(workerMetrics.projectId, input.projectId))
        .orderBy(desc(workerMetrics.totalAnnotations));
      return Promise.all(metrics.map(async m => {
        const user = await db.getUserById(m.userId);
        return {
          ...m,
          name: user?.name ?? `#${m.userId}`,
          skillLevel: user?.skillLevel ?? 1,
          isSuspended: user?.isSuspended ?? false,
          isAvailable: user?.isAvailable ?? true,
        };
      }));
    }),

  /** Manually update a worker's skill level */
  setWorkerSkillLevel: managerProcedure
    .input(z.object({
      userId: z.number(),
      skillLevel: z.number().min(1).max(5),
    }))
    .mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await drizzleDb.update(users)
        .set({ skillLevel: input.skillLevel, updatedAt: new Date() })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  /** Unsuspend a worker */
  unsuspendWorker: managerProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await drizzleDb.update(users).set({
        isSuspended: false,
        isAvailable: true,
        suspendedAt: null,
        suspendReason: null,
        updatedAt: new Date(),
      }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  /** Force-recompute worker metrics */
  recomputeMetrics: managerProcedure.mutation(async () => {
    await recomputeMetrics();
    return { success: true };
  }),

  // ── QA queue ──────────────────────────────────────────────────────────────

  /** Get all tasks currently IN_QA for a project */
  getQAQueue: managerProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return { items: [], total: 0 };

      const qaTasks = await drizzleDb
        .select({
          taskId: tasks.id,
          content: tasks.content,
          isHoneyPot: tasks.isHoneyPot,
          taskStatus: tasks.status,
          annId: annotations.id,
          annResult: annotations.result,
          annUserId: annotations.userId,
          annTimeSpent: annotations.timeSpentSeconds,
          aiSuggestion: annotations.aiSuggestion,
        })
        .from(tasks)
        .innerJoin(annotations, and(eq(annotations.taskId, tasks.id), eq(annotations.isDraft, false)))
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            sql`${tasks.status} IN ('IN_QA', 'submitted')`
          )
        )
        .orderBy(tasks.updatedAt)
        .limit(input.limit)
        .offset(input.offset);

      const enriched = await Promise.all(qaTasks.map(async row => {
        const annotator = await db.getUserById(row.annUserId);
        return {
          ...row,
          annotatorName: annotator?.name ?? `#${row.annUserId}`,
          annotatorSkill: annotator?.skillLevel ?? 1,
        };
      }));

      const totalRows = await drizzleDb
        .select({ c: sql<number>`count(*)` })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            sql`${tasks.status} IN ('IN_QA', 'submitted')`
          )
        );

      return { items: enriched, total: Number(totalRows[0]?.c ?? 0) };
    }),

  /** QA approve with mandatory feedback */
  qaApprove: managerProcedure
    .input(z.object({
      taskId: z.number(),
      annotationId: z.number(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
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

  /** QA reject — requires feedback, task re-enters pool */
  qaReject: managerProcedure
    .input(z.object({
      taskId: z.number(),
      annotationId: z.number(),
      feedback: z.string().min(3, "يجب كتابة ملاحظة الرفض"),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await transition({ taskId: input.taskId, to: "REJECTED", actorId: ctx.user.id, reason: input.feedback });
      // Loop back: REJECTED → ASSIGNED (task re-enters pool)
      await transition({ taskId: input.taskId, to: "ASSIGNED", actorId: ctx.user.id, reason: "re-queued" });

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

  /** Edit annotation result and approve in one step */
  qaEditAndApprove: managerProcedure
    .input(z.object({
      taskId: z.number(),
      annotationId: z.number(),
      correctedResult: z.unknown(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await drizzleDb.update(annotations).set({
        result: input.correctedResult as any,
        updatedAt: new Date(),
      }).where(eq(annotations.id, input.annotationId));

      await transition({ taskId: input.taskId, to: "APPROVED", actorId: ctx.user.id, reason: "QA edited & approved" });
      await drizzleDb.update(annotations)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(annotations.id, input.annotationId));
      await drizzleDb.insert(qaReviews).values({
        annotationId: input.annotationId,
        reviewerId: ctx.user.id,
        status: "approved",
        feedback: input.feedback ?? "✏️ تم التعديل والقبول",
      });
      return { success: true };
    }),

  // ── IAA ───────────────────────────────────────────────────────────────────

  /** Get IAA scores for a project */
  getIAAScores: managerProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      return drizzleDb
        .select()
        .from(iaaScores)
        .where(eq(iaaScores.projectId, input.projectId))
        .orderBy(desc(iaaScores.computedAt));
    }),

  /** Trigger IAA recompute */
  triggerIAACompute: managerProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      await computeIAAForProject(input.projectId);
      return { success: true };
    }),

  // ── Batch management ──────────────────────────────────────────────────────

  /** Create a batch for a project */
  createBatch: managerProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1),
      honeyPotRate: z.number().min(0).max(0.5).default(0.05),
      qaRate: z.number().min(0).max(1).default(0.20),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [batch] = await drizzleDb.insert(batches).values({
        projectId: input.projectId,
        name: input.name,
        honeyPotRate: input.honeyPotRate.toFixed(2),
        qaRate: input.qaRate.toFixed(2),
        createdBy: ctx.user.id,
      }).returning();
      return batch;
    }),

  /** Get batches for a project */
  getBatches: managerProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      return drizzleDb
        .select()
        .from(batches)
        .where(eq(batches.projectId, input.projectId))
        .orderBy(desc(batches.createdAt));
    }),

  // ── Task transitions history ──────────────────────────────────────────────

  /** Get state machine audit log for a task */
  getTaskHistory: managerProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      return drizzleDb
        .select()
        .from(taskTransitions)
        .where(eq(taskTransitions.taskId, input.taskId))
        .orderBy(taskTransitions.createdAt);
    }),
});
