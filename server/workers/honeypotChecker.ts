/**
 * Honey Pot Checker — v4
 * ───────────────────────
 * Compares a worker's annotation result against the task's stored
 * honeyPotAnswer. Returns true if the worker got it right.
 *
 * Supports:
 *   - Simple label/choice match (classification tasks)
 *   - Array label intersection (multi-label tasks)
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, annotations } from "../../drizzle/schema";

type AnyResult = {
  labels?: string[];
  choice?: string;
  label?: string;
  [key: string]: unknown;
};

/**
 * Extract the primary label from an annotation result (any format).
 */
function extractLabel(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as AnyResult;

  if (Array.isArray(r.labels) && r.labels.length > 0) return r.labels[0].toLowerCase().trim();
  if (typeof r.choice === "string") return r.choice.toLowerCase().trim();
  if (typeof r.label === "string") return r.label.toLowerCase().trim();

  return null;
}

/**
 * Extract all labels from a result (for multi-label comparison).
 */
function extractAllLabels(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as AnyResult;
  if (Array.isArray(r.labels)) return r.labels.map((l: string) => l.toLowerCase().trim());
  const single = extractLabel(result);
  return single ? [single] : [];
}

/**
 * Check whether the worker's annotation on a honey pot task is correct.
 * Returns true = passed, false = failed.
 */
export async function checkHoneyPot(taskId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get the task's honey pot answer
  const taskRows = await db
    .select({ honeyPotAnswer: tasks.honeyPotAnswer, isHoneyPot: tasks.isHoneyPot })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = taskRows[0];
  if (!task?.isHoneyPot || !task.honeyPotAnswer) return false;

  // Get the most recent non-draft annotation for this task
  const annRows = await db
    .select({ result: annotations.result })
    .from(annotations)
    .where(and(eq(annotations.taskId, taskId), eq(annotations.isDraft, false)))
    .orderBy(annotations.createdAt)
    .limit(1);

  const ann = annRows[0];
  if (!ann?.result) return false;

  const gtLabel = extractLabel(task.honeyPotAnswer);
  const workerLabel = extractLabel(ann.result);

  // Exact single-label match
  if (gtLabel && workerLabel) {
    return gtLabel === workerLabel;
  }

  // Multi-label: require at least 80% overlap
  const gtLabels = extractAllLabels(task.honeyPotAnswer);
  const workerLabels = extractAllLabels(ann.result);

  if (gtLabels.length === 0) return false;

  const intersection = gtLabels.filter(l => workerLabels.includes(l));
  const overlap = intersection.length / gtLabels.length;
  return overlap >= 0.8;
}

/**
 * Utility: mark a task as a honey pot and set its answer.
 * Used by admin/manager when creating honey pot tasks.
 */
export async function setHoneyPot(
  taskId: number,
  answer: unknown
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(tasks)
    .set({
      isHoneyPot: true,
      honeyPotAnswer: answer as any,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}
