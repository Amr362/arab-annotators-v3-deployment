/**
 * Honey Pot Checker — v4 (Enhanced)
 * ──────────────────────────────────
 * Compares a worker's annotation result against the task's stored
 * honeyPotAnswer. Returns true if the worker got it right.
 *
 * Supports:
 *   - Simple label/choice match (classification tasks)
 *   - Array label intersection (multi-label tasks)
 *
 * Enhancements:
 *   - Better error handling and logging
 *   - Metrics tracking
 *   - Improved edge case handling
 *   - Batch operations support
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, annotations } from "../../drizzle/schema";

// ─── Logging utilities ────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[HoneyPotChecker:${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${timestamp} ${message}`, data);
  } else {
    console.log(`${prefix} ${timestamp} ${message}`);
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface HoneyPotMetrics {
  checked: number;
  passed: number;
  failed: number;
  errors: number;
}

const metrics: HoneyPotMetrics = {
  checked: 0,
  passed: 0,
  failed: 0,
  errors: 0,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type AnyResult = {
  labels?: string[];
  choice?: string;
  label?: string;
  value?: string;
  [key: string]: unknown;
};

// ─── Utility functions ────────────────────────────────────────────────────────

/**
 * Normalize a label for comparison
 */
function normalizeLabel(label: any): string {
  if (!label) return "";
  return String(label).toLowerCase().trim();
}

/**
 * Extract the primary label from an annotation result (any format).
 */
function extractLabel(result: unknown): string | null {
  try {
    if (!result) return null;
    
    if (typeof result === "string") {
      return normalizeLabel(result);
    }

    if (typeof result !== "object") return null;
    
    const r = result as AnyResult;

    // Try different label formats
    if (Array.isArray(r.labels) && r.labels.length > 0) {
      return normalizeLabel(r.labels[0]);
    }
    if (typeof r.choice === "string") {
      return normalizeLabel(r.choice);
    }
    if (typeof r.label === "string") {
      return normalizeLabel(r.label);
    }
    if (typeof r.value === "string") {
      return normalizeLabel(r.value);
    }

    // Try to find any string property
    for (const key in r) {
      const val = r[key];
      if (typeof val === "string" && val.trim()) {
        return normalizeLabel(val);
      }
    }

    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("warn", "Error extracting label", { error: errorMsg });
    return null;
  }
}

/**
 * Extract all labels from a result (for multi-label comparison).
 */
function extractAllLabels(result: unknown): string[] {
  try {
    if (!result) return [];
    
    if (typeof result === "string") {
      const normalized = normalizeLabel(result);
      return normalized ? [normalized] : [];
    }

    if (typeof result !== "object") return [];
    
    const r = result as AnyResult;
    
    if (Array.isArray(r.labels)) {
      return r.labels
        .map((l: any) => normalizeLabel(l))
        .filter((l: string) => l !== "");
    }

    const single = extractLabel(result);
    return single ? [single] : [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("warn", "Error extracting all labels", { error: errorMsg });
    return [];
  }
}

// ─── Core honey pot check ──────────────────────────────────────────────────────

/**
 * Check whether the worker's annotation on a honey pot task is correct.
 * Returns true = passed, false = failed.
 * 
 * Enhancements:
 *   - Better error handling
 *   - Improved logging
 *   - Metrics tracking
 */
export async function checkHoneyPot(taskId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable");
    metrics.errors++;
    return false;
  }

  try {
    // Get the task's honey pot answer
    const taskRows = await db
      .select({ 
        honeyPotAnswer: tasks.honeyPotAnswer, 
        isHoneyPot: tasks.isHoneyPot,
        id: tasks.id,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    const task = taskRows[0];
    if (!task) {
      log("warn", `Task ${taskId} not found`);
      metrics.errors++;
      return false;
    }

    if (!task.isHoneyPot) {
      log("warn", `Task ${taskId} is not a honey pot`);
      metrics.errors++;
      return false;
    }

    if (!task.honeyPotAnswer) {
      log("error", `Task ${taskId} has no honey pot answer defined`);
      metrics.errors++;
      return false;
    }

    // Get the most recent non-draft annotation for this task
    const annRows = await db
      .select({ 
        result: annotations.result,
        userId: annotations.userId,
        id: annotations.id,
      })
      .from(annotations)
      .where(and(eq(annotations.taskId, taskId), eq(annotations.isDraft, false)))
      .orderBy(annotations.createdAt);

    if (annRows.length === 0) {
      log("warn", `Task ${taskId} has no annotations`);
      metrics.errors++;
      return false;
    }

    const ann = annRows[annRows.length - 1];
    if (!ann?.result) {
      log("warn", `Task ${taskId} has no result in latest annotation`);
      metrics.errors++;
      return false;
    }

    // Extract labels
    const gtLabel = extractLabel(task.honeyPotAnswer);
    const workerLabel = extractLabel(ann.result);

    // Exact single-label match
    if (gtLabel && workerLabel) {
      const passed = gtLabel === workerLabel;
      metrics.checked++;
      if (passed) {
        metrics.passed++;
      } else {
        metrics.failed++;
      }
      
      log("info", `Honey pot check: task ${taskId}`, {
        taskId,
        userId: ann.userId,
        passed,
        expected: gtLabel,
        actual: workerLabel,
      });
      
      return passed;
    }

    // Multi-label: require at least 80% overlap
    const gtLabels = extractAllLabels(task.honeyPotAnswer);
    const workerLabels = extractAllLabels(ann.result);

    if (gtLabels.length === 0) {
      log("warn", `Task ${taskId} has no extractable ground truth labels`);
      metrics.errors++;
      return false;
    }

    if (workerLabels.length === 0) {
      log("warn", `Task ${taskId} has no extractable worker labels`);
      metrics.failed++;
      metrics.checked++;
      return false;
    }

    const intersection = gtLabels.filter(l => workerLabels.includes(l));
    const overlap = intersection.length / gtLabels.length;
    const passed = overlap >= 0.8;

    metrics.checked++;
    if (passed) {
      metrics.passed++;
    } else {
      metrics.failed++;
    }

    log("info", `Honey pot check (multi-label): task ${taskId}`, {
      taskId,
      userId: ann.userId,
      passed,
      overlap: (overlap * 100).toFixed(2) + "%",
      expectedLabels: gtLabels,
      actualLabels: workerLabels,
      intersection,
    });

    return passed;
  } catch (error) {
    metrics.errors++;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", `Honey pot check failed for task ${taskId}`, {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

/**
 * Batch check multiple honey pot tasks
 */
export async function checkHoneyPots(taskIds: number[]): Promise<Map<number, boolean>> {
  const results = new Map<number, boolean>();

  if (taskIds.length === 0) {
    return results;
  }

  log("info", `Starting batch honey pot check for ${taskIds.length} tasks`);

  for (const taskId of taskIds) {
    try {
      const passed = await checkHoneyPot(taskId);
      results.set(taskId, passed);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log("error", `Failed to check honey pot ${taskId}`, { error: errorMsg });
      results.set(taskId, false);
    }
  }

  const passedCount = Array.from(results.values()).filter(v => v).length;
  log("info", `Batch honey pot check completed`, {
    total: taskIds.length,
    passed: passedCount,
    failed: taskIds.length - passedCount,
  });

  return results;
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
  if (!db) {
    log("error", "Database unavailable for setHoneyPot");
    return;
  }

  try {
    await db
      .update(tasks)
      .set({
        isHoneyPot: true,
        honeyPotAnswer: answer as any,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    log("info", `Honey pot set for task ${taskId}`, { taskId });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", `Failed to set honey pot for task ${taskId}`, {
      error: errorMsg,
    });
  }
}

/**
 * Get current metrics
 */
export function getMetrics(): HoneyPotMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metrics.checked = 0;
  metrics.passed = 0;
  metrics.failed = 0;
  metrics.errors = 0;
  log("info", "Metrics reset");
}
