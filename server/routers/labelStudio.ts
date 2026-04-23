import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getLabelStudioClient } from "../_core/labelStudio";
import * as db from "../db";
import { tasks, annotations } from "../../drizzle/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsClient() {
  try {
    return getLabelStudioClient();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Label Studio is not configured (missing LABEL_STUDIO_URL or LABEL_STUDIO_API_KEY)",
    });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const labelStudioRouter = router({
  // ── Projects ────────────────────────────────────────────────────────────────

  createProject: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        labelConfig: z.string().optional(),
        expertInstruction: z.string().optional(),
        maximumAnnotations: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await lsClient().createProject({
          title: input.title,
          description: input.description,
          label_config: input.labelConfig,
          expert_instruction: input.expertInstruction,
          maximum_annotations: input.maximumAnnotations,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to create Label Studio project",
        });
      }
    }),

  getProject: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input }) => {
      try {
        return await lsClient().getProject(input.projectId);
      } catch (err: any) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: err?.message ?? "Label Studio project not found",
        });
      }
    }),

  // ── Tasks ───────────────────────────────────────────────────────────────────

  createTask: adminProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        data: z.record(z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await lsClient().createTask({
          project: input.projectId,
          data: input.data,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to create Label Studio task",
        });
      }
    }),

  bulkCreateTasks: adminProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        tasks: z.array(z.record(z.unknown())).min(1).max(1000),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const created = await lsClient().bulkCreateTasks(
          input.projectId,
          input.tasks
        );
        return { created: created.length, tasks: created };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to bulk-create Label Studio tasks",
        });
      }
    }),

  getProjectTasks: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        return await lsClient().getProjectTasks(
          input.projectId,
          input.page,
          input.pageSize
        );
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to fetch Label Studio tasks",
        });
      }
    }),

  // ── Annotations ─────────────────────────────────────────────────────────────

  getTaskCompletions: protectedProcedure
    .input(z.object({ taskId: z.number().int() }))
    .query(async ({ input }) => {
      try {
        return await lsClient().getTaskCompletions(input.taskId);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to fetch task completions",
        });
      }
    }),

  submitAnnotation: protectedProcedure
    .input(
      z.object({
        /** Our internal task ID */
        taskId: z.number().int(),
        /** Label Studio annotation result array */
        result: z.array(z.unknown()),
        wasCancelled: z.boolean().optional(),
        leadTime: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Fetch our task to get the Label Studio task ID
      const task = await db.getTaskById(input.taskId);
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      let lsAnnotationId: number | undefined;

      try {
        const lsAnnotation = await lsClient().createAnnotation(
          task.labelStudioTaskId,
          {
            result: input.result,
            was_cancelled: input.wasCancelled ?? false,
            lead_time: input.leadTime,
          }
        );
        lsAnnotationId = lsAnnotation.id;
      } catch (err: any) {
        // Log but don't fail — we still want to record locally
        console.warn("[LabelStudio] Failed to push annotation to LS:", err?.message);
      }

      // Persist locally
      const drizzleDb = await db.getDb();
      if (!drizzleDb) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      await drizzleDb.insert(annotations).values({
        taskId: input.taskId,
        userId: ctx.user.id,
        labelStudioAnnotationId: lsAnnotationId ?? null,
        result: input.result as any,
        status: "pending_review",
        isDraft: false,
      });

      // Mark task as submitted
      await drizzleDb
        .update(tasks)
        .set({ status: "submitted", updatedAt: new Date() })
        .where(eq(tasks.id, input.taskId));

      return { success: true, labelStudioAnnotationId: lsAnnotationId ?? null };
    }),

  // ── Stats & Export ──────────────────────────────────────────────────────────

  getProjectStats: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input }) => {
      try {
        return await lsClient().getProjectStats(input.projectId);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to fetch project stats",
        });
      }
    }),

  exportAnnotations: adminProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        format: z.enum(["JSON", "CSV", "TSV", "CONLL2003"]).default("JSON"),
      })
    )
    .query(async ({ input }) => {
      try {
        return await lsClient().exportAnnotations(
          input.projectId,
          input.format
        );
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Failed to export annotations",
        });
      }
    }),
});
