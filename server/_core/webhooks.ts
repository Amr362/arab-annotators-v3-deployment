import crypto from "crypto";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, annotations } from "../../drizzle/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LSWebhookAction =
  | "ANNOTATION_CREATED"
  | "ANNOTATION_UPDATED"
  | "ANNOTATION_DELETED"
  | "TASK_CREATED"
  | "TASK_DELETED"
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED";

export interface LSWebhookPayload {
  action: LSWebhookAction;
  annotation?: {
    id: number;
    task: number;
    project?: number;
    result: unknown[];
    completed_by?: number | { id: number };
    was_cancelled?: boolean;
    lead_time?: number;
    created_at?: string;
    updated_at?: string;
  };
  task?: {
    id: number;
    project: number;
    data?: Record<string, unknown>;
  };
  project?: {
    id: number;
    title?: string;
  };
}

// ── Signature validation ──────────────────────────────────────────────────────

/**
 * Validate the HMAC-SHA256 signature sent by Label Studio.
 * Label Studio signs the raw body with the webhook secret and sends it in the
 * `X-Label-Studio-Signature` header as `sha256=<hex>`.
 *
 * If no LABEL_STUDIO_WEBHOOK_SECRET is configured we skip validation (dev mode).
 */
export function validateWebhookSignature(req: Request): boolean {
  const secret = process.env.LABEL_STUDIO_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — allow all (warn in production)
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[Webhook] LABEL_STUDIO_WEBHOOK_SECRET is not set — skipping signature validation"
      );
    }
    return true;
  }

  const header = req.headers["x-label-studio-signature"] as string | undefined;
  if (!header) return false;

  const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Sync an annotation from Label Studio into our local `annotations` table and
 * update the parent task status accordingly.
 */
async function syncAnnotation(payload: LSWebhookPayload): Promise<void> {
  const ann = payload.annotation;
  if (!ann) return;

  const db = await getDb();
  if (!db) {
    console.warn("[Webhook] Database not available — skipping annotation sync");
    return;
  }

  // Find our local task by Label Studio task ID
  const localTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.labelStudioTaskId, ann.task))
    .limit(1);

  if (!localTasks.length) {
    console.warn(
      `[Webhook] No local task found for LS task ID ${ann.task} — skipping`
    );
    return;
  }

  const localTask = localTasks[0];

  // Determine the annotator user ID
  const completedById =
    typeof ann.completed_by === "object" && ann.completed_by !== null
      ? ann.completed_by.id
      : typeof ann.completed_by === "number"
      ? ann.completed_by
      : null;

  if (payload.action === "ANNOTATION_CREATED") {
    // Check if we already have this annotation (e.g. pushed from our side)
    const existing = await db
      .select({ id: annotations.id })
      .from(annotations)
      .where(eq(annotations.labelStudioAnnotationId, ann.id))
      .limit(1);

    if (!existing.length) {
      // Insert new annotation record
      await db.insert(annotations).values({
        taskId: localTask.id,
        userId: completedById ?? localTask.assignedTo ?? 0,
        labelStudioAnnotationId: ann.id,
        result: ann.result as any,
        status: ann.was_cancelled ? "rejected" : "pending_review",
        isDraft: false,
        timeSpentSeconds: ann.lead_time ? Math.round(ann.lead_time) : 0,
      });
    }

    // Update task status to submitted (unless cancelled)
    if (!ann.was_cancelled) {
      await db
        .update(tasks)
        .set({ status: "submitted", updatedAt: new Date() })
        .where(eq(tasks.id, localTask.id));
    }
  } else if (payload.action === "ANNOTATION_UPDATED") {
    // Update the existing annotation result
    await db
      .update(annotations)
      .set({
        result: ann.result as any,
        updatedAt: new Date(),
      })
      .where(eq(annotations.labelStudioAnnotationId, ann.id));
  } else if (payload.action === "ANNOTATION_DELETED") {
    // Mark annotation as rejected / remove it
    await db
      .update(annotations)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(annotations.labelStudioAnnotationId, ann.id));

    // Revert task to pending if no other annotations remain
    const remaining = await db
      .select({ id: annotations.id })
      .from(annotations)
      .where(eq(annotations.taskId, localTask.id));

    if (!remaining.length) {
      await db
        .update(tasks)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(tasks.id, localTask.id));
    }
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleLabelStudioWebhook(
  payload: LSWebhookPayload
): Promise<{ processed: boolean; action: string }> {
  console.log(`[Webhook] Received action: ${payload.action}`);

  switch (payload.action) {
    case "ANNOTATION_CREATED":
    case "ANNOTATION_UPDATED":
    case "ANNOTATION_DELETED":
      await syncAnnotation(payload);
      return { processed: true, action: payload.action };

    case "TASK_CREATED":
    case "TASK_DELETED":
    case "PROJECT_CREATED":
    case "PROJECT_UPDATED":
      // Acknowledged but no local sync needed for these events yet
      return { processed: true, action: payload.action };

    default:
      console.warn(`[Webhook] Unknown action: ${(payload as any).action}`);
      return { processed: false, action: (payload as any).action ?? "unknown" };
  }
}
