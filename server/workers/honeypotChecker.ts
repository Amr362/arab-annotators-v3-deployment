import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, annotations } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

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
  aiChecks: number;
  aiPassed: number;
  aiFailed: number;
}

const metrics: HoneyPotMetrics = {
  checked: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  aiChecks: 0,
  aiPassed: 0,
  aiFailed: 0,
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

/**
 * Use LLM to semantically compare two annotation results.
 * Returns a confidence score (0-1) or null if comparison fails.
 */
async function llmSemanticCompare(
  taskContent: string,
  honeyPotAnswer: unknown,
  workerResult: unknown
): Promise<number | null> {
  try {
    const prompt = `Given the task content: "${taskContent}", assess if the worker's annotation is semantically equivalent to the honey pot answer. Provide a confidence score between 0 and 1, where 1 means perfectly equivalent and 0 means completely different. Only output the score as a number.

Honey Pot Answer: ${JSON.stringify(honeyPotAnswer)}
Worker's Annotation: ${JSON.stringify(workerResult)}

Confidence Score:`;

    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 10,
      responseFormat: { type: "text" },
    });

    const scoreText = response.choices[0]?.message?.content;
    if (typeof scoreText === "string") {
      const score = parseFloat(scoreText.trim());
      if (!isNaN(score) && score >= 0 && score <= 1) {
        return score;
      }
    }
    log("warn", "LLM returned invalid score", { scoreText });
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", "LLM semantic comparison failed", { error: errorMsg });
    return null;
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
 *   - LLM-based semantic comparison for nuanced checks
 */
export async function checkHoneyPot(taskId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable");
    metrics.errors++;
    return false;
  }

  try {
    // Get the task's honey pot answer and content
    const taskRows = await db
      .select({
        honeyPotAnswer: tasks.honeyPotAnswer,
        isHoneyPot: tasks.isHoneyPot,
        id: tasks.id,
        content: tasks.content, // Fetch task content for LLM
        aiHoneyPotCheckEnabled: tasks.aiHoneyPotCheckEnabled, // New flag
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

    let passed = false;

    // Try exact single-label match first
    const gtLabel = extractLabel(task.honeyPotAnswer);
    const workerLabel = extractLabel(ann.result);

    if (gtLabel && workerLabel) {
      passed = gtLabel === workerLabel;
      if (passed) {
        metrics.checked++;
        metrics.passed++;
        log("info", `Honey pot check (exact match): task ${taskId} PASSED`, {
          taskId,
          userId: ann.userId,
          expected: gtLabel,
          actual: workerLabel,
        });
        return true;
      }
    }

    // If not an exact single-label match, try multi-label overlap
    const gtLabels = extractAllLabels(task.honeyPotAnswer);
    const workerLabels = extractAllLabels(ann.result);

    if (gtLabels.length > 0 && workerLabels.length > 0) {
      const intersection = gtLabels.filter(l => workerLabels.includes(l));
      const overlap = intersection.length / gtLabels.length;
      passed = overlap >= 0.8; // Still use 80% overlap for multi-label

      if (passed) {
        metrics.checked++;
        metrics.passed++;
        log("info", `Honey pot check (multi-label overlap): task ${taskId} PASSED`, {
          taskId,
          userId: ann.userId,
          overlap: (overlap * 100).toFixed(2) + "%",
          expectedLabels: gtLabels,
          actualLabels: workerLabels,
        });
        return true;
      }
    }

    // If still not passed and AI check is enabled, use LLM for semantic comparison
    if (!passed && task.aiHoneyPotCheckEnabled) {
      metrics.aiChecks++;
      log("info", `Performing AI semantic check for honey pot task ${taskId}`);
      const confidence = await llmSemanticCompare(task.content ?? "", task.honeyPotAnswer, ann.result);
      
      if (confidence !== null) {
        // Define a threshold for AI-based pass
        const AI_PASS_THRESHOLD = 0.7; 
        passed = confidence >= AI_PASS_THRESHOLD;

        if (passed) {
          metrics.aiPassed++;
          log("info", `Honey pot check (AI semantic): task ${taskId} PASSED`, {
            taskId,
            userId: ann.userId,
            confidence: confidence.toFixed(2),
          });
        } else {
          metrics.aiFailed++;
          log("info", `Honey pot check (AI semantic): task ${taskId} FAILED`, {
            taskId,
            userId: ann.userId,
            confidence: confidence.toFixed(2),
          });
        }
      } else {
        log("warn", `AI semantic check failed for task ${taskId}, defaulting to failed`);
        passed = false; // If AI check fails, consider it a failure
      }
    }

    // If none of the checks passed
    metrics.checked++;
    if (!passed) {
      metrics.failed++;
      log("info", `Honey pot check: task ${taskId} FAILED`, {
        taskId,
        userId: ann.userId,
        expected: gtLabel || JSON.stringify(gtLabels),
        actual: workerLabel || JSON.stringify(workerLabels),
        aiCheckAttempted: task.aiHoneyPotCheckEnabled,
      });
    }

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
  metrics.aiChecks = 0;
  metrics.aiPassed = 0;
  metrics.aiFailed = 0;
  log("info", "Metrics reset");
}
