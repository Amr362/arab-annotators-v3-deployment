/**
 * QASamplingWorker — v4 (Enhanced)
 * ──────────────────────────────────
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
 *
 * Enhancements:
 *   - Fixed fast-path logic (unsampled → APPROVED, not IN_QA)
 *   - Added comprehensive error handling and logging
 *   - Added retry mechanism for transient failures
 *   - Added metrics tracking
 */

import { eq, sql, and } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, annotations, batches, workerMetrics } from "../../drizzle/schema";
import { transition } from "./stateMachine";
import { checkHoneyPot } from "./honeypotChecker";

const DEFAULT_QA_RATE = 0.20; // 20% sampled for QA
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface ProcessingMetrics {
  processed: number;
  approved: number;
  inQa: number;
  honeyPotPassed: number;
  honeyPotFailed: number;
  errors: number;
}

const metrics: ProcessingMetrics = {
  processed: 0,
  approved: 0,
  inQa: 0,
  honeyPotPassed: 0,
  honeyPotFailed: 0,
  errors: 0,
};

// ─── Logging utilities ────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[QASamplingWorker:${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${timestamp} ${message}`, data);
  } else {
    console.log(`${prefix} ${timestamp} ${message}`);
  }
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  taskId: number,
  operationName: string,
  retries = MAX_RETRIES
): Promise<T | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (isLastAttempt) {
        log("error", `${operationName} failed for task ${taskId} after ${retries} attempts`, {
          error: errorMsg,
          taskId,
        });
        return null;
      }
      
      log("warn", `${operationName} attempt ${attempt} failed for task ${taskId}, retrying...`, {
        error: errorMsg,
        nextAttempt: attempt + 1,
      });
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
  
  return null;
}

/**
 * Process a single SUBMITTED task.
 * Called by BullMQ job handler or direct invocation after annotation submit.
 * 
 * FIXED: Unsampled tasks now go directly to APPROVED (fast-path)
 */
export async function processSubmittedTask(taskId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable");
    metrics.errors++;
    return;
  }

  try {
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
    if (!task) {
      log("warn", `Task ${taskId} not found`);
      return;
    }

    // Only process tasks in SUBMITTED state
    if (task.status !== "SUBMITTED" && task.status !== "submitted") {
      log("warn", `Task ${taskId} is not in SUBMITTED state`, { status: task.status });
      return;
    }

    // ── Honey pot path ────────────────────────────────────────────────────────
    if (task.isHoneyPot) {
      log("info", `Processing honey pot task ${taskId}`);
      
      const passed = await withRetry(
        () => checkHoneyPot(taskId),
        taskId,
        "Honey pot check"
      );

      if (passed === null) {
        metrics.errors++;
        return;
      }

      // Update the annotation honey pot result
      await withRetry(
        () =>
          db
            .update(annotations)
            .set({ isHoneyPotCheck: true, honeyPotPassed: passed, updatedAt: new Date() })
            .where(and(eq(annotations.taskId, taskId), eq(annotations.isDraft, false))),
        taskId,
        "Update annotation honey pot result"
      );

      if (passed) {
        await withRetry(
          () => transition({ taskId, to: "APPROVED", reason: "honey pot passed" }),
          taskId,
          "Transition to APPROVED (honey pot passed)"
        );
        metrics.honeyPotPassed++;
        log("info", `Honey pot task ${taskId} PASSED`, { taskId });
      } else {
        await withRetry(
          () => transition({ taskId, to: "REJECTED", reason: "honey pot failed" }),
          taskId,
          "Transition to REJECTED (honey pot failed)"
        );
        metrics.honeyPotFailed++;
        log("info", `Honey pot task ${taskId} FAILED`, { taskId });
        // The worker will be flagged by StatsWorker on next recompute
      }
      
      metrics.processed++;
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
      
      if (batchRows[0]) {
        qaRate = Number(batchRows[0].qaRate);
      }
    }

    // Validate QA rate
    if (qaRate < 0 || qaRate > 1) {
      log("warn", `Invalid QA rate ${qaRate} for task ${taskId}, using default`, {
        taskId,
        invalidRate: qaRate,
      });
      qaRate = DEFAULT_QA_RATE;
    }

    const sampled = Math.random() < qaRate;

    if (sampled) {
      // Route to QA reviewer
      await withRetry(
        () => transition({ taskId, to: "IN_QA", reason: "QA sampling" }),
        taskId,
        "Transition to IN_QA"
      );
      metrics.inQa++;
      log("info", `Task ${taskId} sampled for QA review`, { taskId, qaRate });
    } else {
      // FIXED: Fast-path approval for unsampled tasks
      await withRetry(
        () => transition({ taskId, to: "APPROVED", reason: "QA auto-approve (unsampled)" }),
        taskId,
        "Transition to APPROVED (fast-path)"
      );
      metrics.approved++;
      log("info", `Task ${taskId} auto-approved (fast-path)`, { taskId, qaRate });
    }

    metrics.processed++;
  } catch (error) {
    metrics.errors++;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", `Unexpected error processing task ${taskId}`, {
      error: errorMsg,
      taskId,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Batch job: sweep all SUBMITTED tasks that haven't been processed yet.
 * Safe to run on a 30s interval.
 */
export async function sweepSubmittedTasks(): Promise<number> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable for sweep");
    return 0;
  }

  try {
    const submittedTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.status} IN ('SUBMITTED', 'submitted')`);

    if (submittedTasks.length === 0) {
      log("info", "No submitted tasks to process");
      return 0;
    }

    log("info", `Starting sweep of ${submittedTasks.length} submitted tasks`);

    let processed = 0;
    for (const t of submittedTasks) {
      try {
        await processSubmittedTask(t.id);
        processed++;
      } catch (e) {
        metrics.errors++;
        const errorMsg = e instanceof Error ? e.message : String(e);
        log("error", `Failed to process task ${t.id} during sweep`, {
          error: errorMsg,
          taskId: t.id,
        });
      }
    }

    log("info", `Sweep completed`, {
      processed,
      total: submittedTasks.length,
      metrics,
    });

    return processed;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", "Sweep operation failed", {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return 0;
  }
}

/**
 * Get current processing metrics
 */
export function getMetrics(): ProcessingMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (useful for testing or periodic resets)
 */
export function resetMetrics(): void {
  metrics.processed = 0;
  metrics.approved = 0;
  metrics.inQa = 0;
  metrics.honeyPotPassed = 0;
  metrics.honeyPotFailed = 0;
  metrics.errors = 0;
  log("info", "Metrics reset");
}
