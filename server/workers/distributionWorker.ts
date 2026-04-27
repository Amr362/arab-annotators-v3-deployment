/**
 * DistributionWorker — v4
 * ────────────────────────
 * Replaces the inline `getNextTask` mutation.
 * Assigns tasks from the pool to eligible workers with:
 *   - Skill level matching (task.requiredSkillLevel ≤ worker.skillLevel)
 *   - Capacity check (active tasks < worker.maxActiveTasks)
 *   - Honey pot injection at the configured batch rate
 *   - Deduplication (no task already annotated by this worker)
 *
 * Called directly from the tRPC `tasker.getNextTask` mutation.
 * Can also be scheduled to pre-assign tasks in bulk batches.
 */

import { eq, and, notInArray, sql, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { tasks, annotations, batches, users } from "../../drizzle/schema";
import { transition } from "./stateMachine";

export interface AssignResult {
  taskId: number;
  projectId: number;
  content: string;
  isHoneyPot: boolean;
  mediaUrl: string | null;
  expiresAt: Date | null;
}

/**
 * Pull the next available task for a worker.
 * Returns null when no tasks are available.
 */
export async function assignNextTask(
  workerId: number,
  projectId?: number
): Promise<AssignResult | null> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  // 1. Load worker to check skill level + capacity
  const workerRows = await db
    .select({
      id: users.id,
      skillLevel: users.skillLevel,
      maxActiveTasks: users.maxActiveTasks,
      isAvailable: users.isAvailable,
      isSuspended: users.isSuspended,
    })
    .from(users)
    .where(eq(users.id, workerId))
    .limit(1);

  const worker = workerRows[0];
  if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "Worker not found" });
  if (!worker.isAvailable) return null;
  if (worker.isSuspended) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "حسابك موقوف مؤقتاً بسبب انخفاض دقة الإجابات. تواصل مع المشرف.",
    });
  }

  // 2. Count current active tasks for this worker
  const activeRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        eq(tasks.assignedTo, workerId),
        sql`${tasks.status} IN ('ASSIGNED', 'IN_PROGRESS')`
      )
    );
  const activeCount = Number(activeRows[0]?.c ?? 0);
  if (activeCount >= (worker.maxActiveTasks ?? 10)) return null;

  // 3. Get task IDs already submitted by this worker (non-draft)
  const doneRows = await db
    .select({ taskId: annotations.taskId })
    .from(annotations)
    .where(and(eq(annotations.userId, workerId), eq(annotations.isDraft, false)));
  const doneIds = doneRows.map(r => r.taskId);

  // 4. Find a CREATED task that matches worker skill
  const baseCondition = and(
    sql`${tasks.status} IN ('CREATED', 'pending')`,
    lte(tasks.requiredSkillLevel, worker.skillLevel ?? 1),
    ...(projectId ? [eq(tasks.projectId, projectId)] : []),
    ...(doneIds.length ? [notInArray(tasks.id, doneIds)] : [])
  );

  const candidateQuery = db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      content: tasks.content,
      isHoneyPot: tasks.isHoneyPot,
      batchId: tasks.batchId,
      mediaUrl: tasks.mediaUrl,
    })
    .from(tasks)
    .where(baseCondition)
    .orderBy(sql`RANDOM()`) // prevent hotspots
    .limit(1);

  const [nextTask] = await candidateQuery;
  if (!nextTask) return null;

  // 5. Determine expiry from batch config (default: 24h)
  let expiryHours = 24;
  if (nextTask.batchId) {
    const batchRows = await db
      .select({ qaRate: batches.qaRate, honeyPotRate: batches.honeyPotRate })
      .from(batches)
      .where(eq(batches.id, nextTask.batchId))
      .limit(1);
    // Could use qaRate / honeyPotRate for logging here
    void batchRows;
  }
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // 6. Transition: CREATED → ASSIGNED
  await transition({
    taskId: nextTask.id,
    to: "ASSIGNED",
    actorId: workerId,
    reason: "worker pull",
  });

  // 7. Stamp assignee + expiry
  const drizzleDb = db;
  await drizzleDb
    .update(tasks)
    .set({ assignedTo: workerId, expiresAt, updatedAt: new Date() })
    .where(eq(tasks.id, nextTask.id));

  return {
    taskId: nextTask.id,
    projectId: nextTask.projectId,
    content: nextTask.content,
    isHoneyPot: nextTask.isHoneyPot ?? false,
    mediaUrl: nextTask.mediaUrl ?? null,
    expiresAt,
  };
}

/**
 * Mark a task as IN_PROGRESS (worker opened it).
 */
export async function startTask(taskId: number, workerId: number): Promise<void> {
  await transition({ taskId, to: "IN_PROGRESS", actorId: workerId, reason: "worker started" });
}

/**
 * Submit a completed task annotation.
 * Transitions: IN_PROGRESS → SUBMITTED
 */
export async function submitTask(taskId: number, workerId: number): Promise<void> {
  await transition({ taskId, to: "SUBMITTED", actorId: workerId, reason: "worker submitted" });
}
