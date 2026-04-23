import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  validateWebhookSignature,
  handleLabelStudioWebhook,
  type LSWebhookPayload,
} from "../_core/webhooks";

// ── Webhook router ────────────────────────────────────────────────────────────
// Exposed as a tRPC mutation so it can be called from the Express webhook
// endpoint registered in server/_core/index.ts.  The actual HTTP route
// POST /api/webhooks/label-studio is wired up there.

export const webhooksRouter = router({
  /**
   * Receive a Label Studio webhook event.
   * In practice this is called by the raw Express handler (see index.ts) which
   * validates the signature before forwarding the parsed body here.
   */
  labelStudio: publicProcedure
    .input(
      z.object({
        action: z.string(),
        annotation: z
          .object({
            id: z.number(),
            task: z.number(),
            project: z.number().optional(),
            result: z.array(z.unknown()),
            completed_by: z.union([z.number(), z.object({ id: z.number() })]).optional(),
            was_cancelled: z.boolean().optional(),
            lead_time: z.number().optional(),
            created_at: z.string().optional(),
            updated_at: z.string().optional(),
          })
          .optional(),
        task: z
          .object({
            id: z.number(),
            project: z.number(),
            data: z.record(z.unknown()).optional(),
          })
          .optional(),
        project: z
          .object({
            id: z.number(),
            title: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await handleLabelStudioWebhook(input as LSWebhookPayload);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Webhook processing failed",
        });
      }
    }),
});
