/**
 * QASamplingWorker — v4
 * ──────────────────────
 * Watches for SUBMITTED tasks and moves them through QA.
 *
 * For each SUBMITTED task:
 *   - If task is a honey pot → run automatic checkHoneyPot()
 *   - Otherwise → sample according to batch.qaRate:
 *       sampled tasks → IN_QA (routed to a QA reviewer)
 *       unsampled tasks → APPROVED directly (fast-path)
 *
 * Runs via BullMQ job queue (triggered on annotation submit)
 * or can be polled as a scheduled job every 30s.
 */

import { eq, sql, and } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, annotations, batches, workerMetrics } from "../../drizzle/schema";
import { transition } from "./stateMachine";
import { checkHoneyPot } from "./honeypotChecker";

const DEFAULT_QA_RATE = 0.20; // 20% sampled for QA

/**
 * Process a single SUBMITTED task.
 * Called by BullMQ job handler or direct invocation after annotation submit.
 */
export async function processSubmittedTask(taskId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const taskRows = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      projectId: tasks.projectId,
      isHoneyPot: tasks.isHoneyPot,
      batchId: tasks.batchId,
      assignedTo: tasks.assignedTo,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = taskRows[0];
  if (!task) return;
  if (task.status !== "SUBMITTED" && task.status !== "submitted") return;

  // ── Honey pot path ────────────────────────────────────────────────────────
  if (task.isHoneyPot) {
    const passed = await checkHoneyPot(taskId);
    // Update the annotation honey pot result
    await db
      .update(annotations)
      .set({ isHoneyPotCheck: true, honeyPotPassed: passed, updatedAt: new Date() })
      .where(and(eq(annotations.taskId, taskId), eq(annotations.isDraft, false)));

    if (passed) {
      await transition({ taskId, to: "APPROVED", reason: "honey pot passed" });
    } else {
      await transition({ taskId, to: "REJECTED", reason: "honey pot failed" });
      // The worker will be flagged by StatsWorker on next recompute
    }
    return;
  }

  // ── Normal QA sampling path ───────────────────────────────────────────────
  let qaRate = DEFAULT_QA_RATE;
  if (task.batchId) {
    const batchRows = await db
      .select({ qaRate: batches.qaRate })
      .from(batches)
      .where(eq(batches.id, task.batchId))
      .limit(1);
    if (batchRows[0]) qaRate = Number(batchRows[0].qaRate);
  }

  const sampled = Math.random() < qaRate;

  if (sampled) {
    await transition({ taskId, to: "IN_QA", reason: "QA sampling" });
  } else {
    // Fast-path: directly approve unsampled tasks
    await transition({ taskId, to: "IN_QA", reason: "QA auto-route" });
    // In production: queue to IN_QA and let a QA reviewer approve.
    // For fast-path, we still route through IN_QA → APPROVED via QA router.
  }
}

/**
 * Batch job: sweep all SUBMITTED tasks that haven't been processed yet.
 * Safe to run on a 30s interval.
 */
export async function sweepSubmittedTasks(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const submittedTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(sql`${tasks.status} IN ('SUBMITTED', 'submitted')`);

  let processed = 0;
  for (const t of submittedTasks) {
    try {
      await processSubmittedTask(t.id);
      processed++;
    } catch (e) {
      console.error(`[QASampling] Failed to process task ${t.id}:`, e);
    }
  }

  return processed;
}
