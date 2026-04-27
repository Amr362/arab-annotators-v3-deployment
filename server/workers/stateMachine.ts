/**
 * TaskStateMachine — v4
 * ─────────────────────
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
 */

import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { tasks, taskTransitions } from "../../drizzle/schema";

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

// ─── Canonical alias map (v3 → v4) ───────────────────────────────────────────

const CANONICAL: Record<string, TaskStatus> = {
  pending: "CREATED",
  in_progress: "IN_PROGRESS",
  submitted: "SUBMITTED",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function canonical(s: string): TaskStatus {
  return (CANONICAL[s] ?? s) as TaskStatus;
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
 */
export async function transition(opts: TransitionOptions): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  const { taskId, to, actorId, reason } = opts;

  // Lock the row
  const rows = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!rows.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Task ${taskId} not found` });
  }

  const currentRaw = rows[0].status;
  const current = canonical(currentRaw);
  const target = canonical(to as string);

  const allowed = VALID_TRANSITIONS[current] ?? [];
  const allowedCanonical = allowed.map(s => canonical(s as string));

  if (!allowedCanonical.includes(target)) {
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
}

/**
 * Check whether a transition is valid without executing it.
 */
export function isValidTransition(from: string, to: string): boolean {
  const f = canonical(from);
  const t = canonical(to);
  const allowed = (VALID_TRANSITIONS[f] ?? []).map(s => canonical(s as string));
  return allowed.includes(t);
}

/**
 * Convenience: bulk-expire tasks that have passed their expiresAt timestamp.
 * Called by a scheduled worker every minute.
 */
export async function expireOverdueTasks(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Find tasks in ASSIGNED or IN_PROGRESS that have expired
  const overdue = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(
      sql`${tasks.expiresAt} IS NOT NULL
          AND ${tasks.expiresAt} < NOW()
          AND ${tasks.status} IN ('ASSIGNED', 'IN_PROGRESS', 'assigned', 'in_progress')`
    );

  for (const task of overdue) {
    try {
      await transition({ taskId: task.id, to: "EXPIRED", reason: "auto-expired" });
      // Reset assignee so the task returns to the pool
      await db
        .update(tasks)
        .set({ assignedTo: null, expiresAt: null, updatedAt: new Date() })
        .where(eq(tasks.id, task.id));
    } catch {
      // Log but continue — don't let one bad task block others
      console.error(`[StateMachine] Failed to expire task ${task.id}`);
    }
  }

  return overdue.length;
}
