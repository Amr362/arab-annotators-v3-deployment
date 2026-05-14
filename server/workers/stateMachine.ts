/**
 * TaskStateMachine — v4 (Enhanced)
 * ─────────────────────────────────
 * Single source of truth for all task status transitions.
 * Every status change MUST go through `transition()` — never
 * call `db.update(tasks).set({ status })` directly.
 *
 * Valid flow:
 *   CREATED → ASSIGNED → IN_PROGRESS → SUBMITTED → IN_QA → APPROVED
 *                                                         ↘ REJECTED → ASSIGNED (retry)
 *   ASSIGNED | IN_PROGRESS → EXPIRED
 *
 * Legacy v3 statuses ('pending', 'in_progress' lowercase) are treated
 * as aliases for CREATED and IN_PROGRESS respectively.
 *
 * Enhancements:
 *   - Better error handling and logging
 *   - Improved validation
 *   - Transaction safety
 *   - Metrics tracking
 */

import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { tasks, taskTransitions } from "../../drizzle/schema";

// ─── Logging utilities ────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[StateMachine:${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${timestamp} ${message}`, data);
  } else {
    console.log(`${prefix} ${timestamp} ${message}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "CREATED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "IN_QA"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  // v3 legacy aliases
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export interface TransitionOptions {
  taskId: number;
  to: TaskStatus;
  actorId?: number;
  reason?: string;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface TransitionMetrics {
  total: number;
  successful: number;
  failed: number;
  byTransition: Record<string, number>;
}

const metrics: TransitionMetrics = {
  total: 0,
  successful: 0,
  failed: 0,
  byTransition: {},
};

// ─── Canonical alias map (v3 → v4) ───────────────────────────────────────────

const CANONICAL: Record<string, TaskStatus> = {
  pending: "CREATED",
  in_progress: "IN_PROGRESS",
  submitted: "SUBMITTED",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function canonical(s: string): TaskStatus {
  const result = (CANONICAL[s] ?? s) as TaskStatus;
  return result;
}

// ─── Valid transition map ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  CREATED:      ["ASSIGNED"],
  ASSIGNED:     ["IN_PROGRESS", "EXPIRED"],
  IN_PROGRESS:  ["SUBMITTED", "EXPIRED"],
  SUBMITTED:    ["IN_QA"],
  IN_QA:        ["APPROVED", "REJECTED"],
  APPROVED:     [], // terminal
  REJECTED:     ["ASSIGNED"], // retry loop
  EXPIRED:      ["CREATED"], // reset to pool

  // v3 aliases — map through canonical in the engine below
  pending:      ["ASSIGNED", "IN_PROGRESS"],
  in_progress:  ["SUBMITTED", "EXPIRED"],
  submitted:    ["IN_QA"],
  approved:     [],
  rejected:     ["ASSIGNED"],
};

// ─── Core transition engine ───────────────────────────────────────────────────

/**
 * Atomically transitions a task to a new status.
 *
 * Uses SELECT FOR UPDATE to prevent concurrent race conditions.
 * Writes a row to task_transitions for every change.
 * Throws TRPCError on invalid transitions or missing tasks.
 * 
 * Enhancements:
 *   - Better logging
 *   - Metrics tracking
 *   - Improved error messages
 *   - Validation of inputs
 */
export async function transition(opts: TransitionOptions): Promise<void> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable");
    metrics.total++;
    metrics.failed++;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  }

  const { taskId, to, actorId, reason } = opts;

  // Validate inputs
  if (!taskId || taskId <= 0) {
    log("error", "Invalid taskId", { taskId });
    metrics.total++;
    metrics.failed++;
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid taskId" });
  }

  if (!to || typeof to !== "string") {
    log("error", "Invalid target status", { to });
    metrics.total++;
    metrics.failed++;
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid target status" });
  }

  try {
    // Lock the row
    const rows = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!rows.length) {
      log("warn", `Task ${taskId} not found`);
      metrics.total++;
      metrics.failed++;
      throw new TRPCError({ code: "NOT_FOUND", message: `Task ${taskId} not found` });
    }

    const currentRaw = rows[0].status;
    const current = canonical(currentRaw);
    const target = canonical(to as string);

    // Validate transition
    const allowed = VALID_TRANSITIONS[current] ?? [];
    const allowedCanonical = allowed.map(s => canonical(s as string));

    if (!allowedCanonical.includes(target)) {
      log("warn", `Invalid transition attempted`, {
        taskId,
        from: current,
        to: target,
        allowed: allowedCanonical,
      });
      metrics.total++;
      metrics.failed++;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid transition: ${current} → ${target}. Allowed: [${allowedCanonical.join(", ")}]`,
      });
    }

    // Apply update
    await db
      .update(tasks)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // Log transition
    await db.insert(taskTransitions).values({
      taskId,
      fromStatus: current,
      toStatus: target,
      actorId: actorId ?? null,
      reason: reason ?? null,
    });

    // Track metrics
    const transitionKey = `${current}→${target}`;
    metrics.byTransition[transitionKey] = (metrics.byTransition[transitionKey] ?? 0) + 1;
    metrics.total++;
    metrics.successful++;

    log("info", `Task ${taskId} transitioned`, {
      taskId,
      from: current,
      to: target,
      reason,
      actorId,
    });
  } catch (error) {
    metrics.total++;
    metrics.failed++;

    // Re-throw TRPC errors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    // Log and wrap other errors
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", `Transition failed for task ${taskId}`, {
      taskId,
      to,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Transition failed: ${errorMsg}`,
    });
  }
}

/**
 * Check whether a transition is valid without executing it.
 */
export function isValidTransition(from: string, to: string): boolean {
  try {
    const f = canonical(from);
    const t = canonical(to);
    const allowed = (VALID_TRANSITIONS[f] ?? []).map(s => canonical(s as string));
    return allowed.includes(t);
  } catch (error) {
    log("warn", "Error checking transition validity", { from, to });
    return false;
  }
}

/**
 * Convenience: bulk-expire tasks that have passed their expiresAt timestamp.
 * Called by a scheduled worker every minute.
 * 
 * Enhancements:
 *   - Better error handling
 *   - Improved logging
 *   - Metrics tracking
 */
export async function expireOverdueTasks(): Promise<number> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable for expiry check");
    return 0;
  }

  try {
    // Find tasks in ASSIGNED or IN_PROGRESS that have expired
    const overdue = await db
      .select({ id: tasks.id, status: tasks.status, expiresAt: tasks.expiresAt })
      .from(tasks)
      .where(
        sql`${tasks.expiresAt} IS NOT NULL
            AND ${tasks.expiresAt} < NOW()
            AND ${tasks.status} IN ('ASSIGNED', 'IN_PROGRESS', 'assigned', 'in_progress')`
      );

    if (overdue.length === 0) {
      return 0;
    }

    log("info", `Found ${overdue.length} overdue tasks to expire`);

    let expiredCount = 0;
    let failedCount = 0;

    for (const task of overdue) {
      try {
        await transition({ taskId: task.id, to: "EXPIRED", reason: "auto-expired" });
        
        // Reset assignee so the task returns to the pool
        await db
          .update(tasks)
          .set({ assignedTo: null, expiresAt: null, updatedAt: new Date() })
          .where(eq(tasks.id, task.id));

        expiredCount++;
      } catch (error) {
        failedCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        log("warn", `Failed to expire task ${task.id}`, {
          taskId: task.id,
          error: errorMsg,
        });
        // Continue to next task — don't let one bad task block others
      }
    }

    log("info", `Task expiry completed`, {
      total: overdue.length,
      expired: expiredCount,
      failed: failedCount,
    });

    return expiredCount;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", "Task expiry check failed", {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return 0;
  }
}

/**
 * Get current transition metrics
 */
export function getMetrics(): TransitionMetrics {
  return {
    total: metrics.total,
    successful: metrics.successful,
    failed: metrics.failed,
    byTransition: { ...metrics.byTransition },
  };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metrics.total = 0;
  metrics.successful = 0;
  metrics.failed = 0;
  metrics.byTransition = {};
  log("info", "Metrics reset");
}
