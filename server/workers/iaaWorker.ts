import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import { annotations, tasks, iaaScores } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

const IAA_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MIN_TASKS_FOR_IAA = 5; // Minimum tasks needed for meaningful IAA
const RETENTION_DAYS = 30; // Keep IAA scores for 30 days

// ─── Logging utilities ────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[IAAWorker:${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${timestamp} ${message}`, data);
  } else {
    console.log(`${prefix} ${timestamp} ${message}`);
  }
}

// ─── LLM Semantic Comparison ──────────────────────────────────────────────────

/**
 * Use LLM to semantically compare two labels/results and return a confidence score.
 * Returns a confidence score between 0 and 1, or null if comparison fails.
 */
async function llmSemanticCompareLabels(
  taskContent: string,
  label1: string,
  label2: string
): Promise<number | null> {
  try {
    const prompt = `Given the task content: "${taskContent}", are these two labels semantically equivalent? Provide a confidence score between 0 and 1, where 1 means perfectly equivalent and 0 means completely different. Only output the score as a number.

Label 1: ${label1}
Label 2: ${label2}

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
    log("warn", "LLM returned invalid score for semantic comparison", { scoreText });
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", "LLM semantic comparison failed", { error: errorMsg });
    return null;
  }
}

// ─── Cohen's Kappa ────────────────────────────────────────────────────────────

/**
 * Compute Cohen's Kappa for two annotators on a shared set of tasks.
 * κ = (Po - Pe) / (1 - Pe)
 * where Po = observed agreement, Pe = expected agreement by chance
 * 
 * Returns NaN if computation is invalid, 0 if no agreement data
 */
export function computeCohensKappa(
  labels1: string[],
  labels2: string[]
): number {
  if (labels1.length !== labels2.length || labels1.length === 0) {
    return 0;
  }

  // Validate input
  if (!Array.isArray(labels1) || !Array.isArray(labels2)) {
    log("warn", "Invalid input to computeCohensKappa", { 
      labels1Type: typeof labels1, 
      labels2Type: typeof labels2 
    });
    return 0;
  }

  const n = labels1.length;

  // Observed agreement
  const agreed = labels1.filter((l, i) => {
    const l1 = String(l).toLowerCase().trim();
    const l2 = String(labels2[i]).toLowerCase().trim();
    return l1 === l2 && l1 !== "";
  }).length;
  const po = agreed / n;

  // Get unique labels across both
  const allLabels = [...new Set([...labels1, ...labels2])].filter(l => l && String(l).trim() !== "");

  if (allLabels.length === 0) {
    return 0;
  }

  // Expected agreement by chance
  let pe = 0;
  for (const label of allLabels) {
    const labelStr = String(label).toLowerCase().trim();
    const p1 = labels1.filter(l => String(l).toLowerCase().trim() === labelStr).length / n;
    const p2 = labels2.filter(l => String(l).toLowerCase().trim() === labelStr).length / n;
    pe += p1 * p2;
  }

  // Handle edge cases
  if (pe >= 1) {
    return po === 1 ? 1 : 0; // Perfect expected agreement or no variance
  }

  const kappa = (po - pe) / (1 - pe);
  
  // Validate result
  if (isNaN(kappa) || !isFinite(kappa)) {
    log("warn", "Cohen's Kappa computation resulted in invalid value", {
      po,
      pe,
      kappa,
      n,
    });
    return 0;
  }

  return Math.max(-1, Math.min(1, kappa)); // Clamp to [-1, 1]
}

// ─── Fleiss' Kappa ────────────────────────────────────────────────────────────

/**
 * Compute Fleiss' Kappa for N annotators on shared tasks.
 * taskLabels: object mapping taskId → array of labels from each annotator
 * 
 * Returns NaN if computation is invalid, 0 if no data
 */
export function computeFleissKappa(
  taskLabels: Record<string, string[]>
): number {
  const taskIds = Object.keys(taskLabels);
  if (taskIds.length === 0) {
    return 0;
  }

  // Validate input
  if (typeof taskLabels !== "object" || taskLabels === null) {
    log("warn", "Invalid input to computeFleissKappa");
    return 0;
  }

  const allLabels = [...new Set(
    Object.values(taskLabels)
      .flat()
      .map(l => String(l).toLowerCase().trim())
      .filter(l => l !== "")
  )];

  const n = taskIds.length;
  const k = Math.max(...taskIds.map(tid => {
    const labels = taskLabels[tid];
    return Array.isArray(labels) ? labels.length : 0;
  }));

  if (k < 2 || allLabels.length === 0) {
    return 0;
  }

  // P_j: proportion of all assignments that were category j
  const labelCounts: Record<string, number> = {};
  for (const tid of taskIds) {
    const tLabels = taskLabels[tid];
    if (!Array.isArray(tLabels)) continue;
    
    for (const label of tLabels) {
      const labelStr = String(label).toLowerCase().trim();
      if (labelStr === "") continue;
      labelCounts[labelStr] = (labelCounts[labelStr] ?? 0) + 1;
    }
  }

  const totalAssignments = n * k;
  if (totalAssignments === 0) {
    return 0;
  }

  // P_i: extent of agreement for item i
  let sumPi = 0;
  for (const tid of taskIds) {
    const tLabels = taskLabels[tid];
    if (!Array.isArray(tLabels)) continue;
    
    let taskAgreement = 0;
    for (const label of allLabels) {
      const count = tLabels
        .map(l => String(l).toLowerCase().trim())
        .filter(l => l === label).length;
      taskAgreement += count * (count - 1);
    }
    sumPi += taskAgreement / (k * (k - 1));
  }
  const pBar = sumPi / n;

  // P_e: expected agreement
  let pE = 0;
  for (const label of allLabels) {
    const pj = (labelCounts[label] ?? 0) / totalAssignments;
    pE += pj * pj;
  }

  // Handle edge cases
  if (pE >= 1) {
    return pBar === 1 ? 1 : 0;
  }

  const fleiss = (pBar - pE) / (1 - pE);
  
  // Validate result
  if (isNaN(fleiss) || !isFinite(fleiss)) {
    log("warn", "Fleiss' Kappa computation resulted in invalid value", {
      pBar,
      pE,
      fleiss,
      n,
      k,
    });
    return 0;
  }

  return Math.max(-1, Math.min(1, fleiss)); // Clamp to [-1, 1]
}

// ─── Cleanup old scores ───────────────────────────────────────────────────────

async function cleanupOldScores(db: any, projectId: number): Promise<void> {
  try {
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(iaaScores)
      .where(
        and(
          eq(iaaScores.projectId, projectId),
          sql`${iaaScores.computedAt} < ${cutoffDate}`
        )
      );

    if (result && result.rowCount > 0) {
      log("info", `Cleaned up ${result.rowCount} old IAA scores for project ${projectId}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("warn", `Failed to cleanup old IAA scores for project ${projectId}`, { error: errorMsg });
  }
}

// ─── IAA computation for a project ───────────────────────────────────────────

export async function computeIAAForProject(projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable");
    return;
  }

  try {
    // Get all non-draft annotations for this project, grouped by task
    const rows = await db
      .select({
        taskId: annotations.taskId,
        userId: annotations.userId,
        result: annotations.result,
        taskContent: tasks.content, // Fetch task content for LLM
      })
      .from(annotations)
      .innerJoin(tasks, eq(annotations.taskId, tasks.id))
      .where(
        and(
          eq(tasks.projectId, projectId),
          eq(annotations.isDraft, false),
          // Exclude honey pots from IAA
          eq(tasks.isHoneyPot, false)
        )
      );

    if (rows.length < 2) {
      log("info", `Project ${projectId} has insufficient annotations for IAA (${rows.length})`);
      return;
    }

    // Group by task
    const byTask: Record<number, { userId: number; label: string; rawResult: any; taskContent: string }[]> = {};
    for (const row of rows) {
      try {
        const result = row.result as any;
        let label = "unknown";

        if (result) {
          label =
            result?.labels?.[0] ??
            result?.choice ??
            result?.label ??
            (typeof result === "string" ? result : JSON.stringify(result));
        }

        const labelStr = String(label).toLowerCase().trim();
        if (!labelStr || labelStr === "unknown") {
          log("warn", `Invalid label for task ${row.taskId}`, { result });
          continue;
        }

        if (!byTask[row.taskId]) byTask[row.taskId] = [];
        byTask[row.taskId].push({ userId: row.userId, label: labelStr, rawResult: result, taskContent: row.taskContent ?? "" });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log("warn", `Failed to process annotation for task ${row.taskId}`, { error: errorMsg });
        continue;
      }
    }

    // Only tasks with ≥ 2 annotations are useful for IAA
    const multiAnnotatedTaskIds = Object.keys(byTask).filter(
      tid => byTask[Number(tid)].length >= 2
    );

    if (multiAnnotatedTaskIds.length < MIN_TASKS_FOR_IAA) {
      log("info", `Project ${projectId} has insufficient multi-annotated tasks for IAA (${multiAnnotatedTaskIds.length})`);
      return;
    }

    log("info", `Computing IAA for project ${projectId}`, {
      totalAnnotations: rows.length,
      multiAnnotatedTasks: multiAnnotatedTaskIds.length,
    });

    // Get unique annotator pairs
    const annotatorIds = [...new Set(rows.map(r => r.userId))];

    // ── Pairwise Cohen's Kappa ────────────────────────────────────────────────
    let cohensCount = 0;
    for (let i = 0; i < annotatorIds.length; i++) {
      for (let j = i + 1; j < annotatorIds.length; j++) {
        const a1 = annotatorIds[i];
        const a2 = annotatorIds[j];

        // Find tasks where BOTH annotators have annotations
        const sharedTaskIds = multiAnnotatedTaskIds.filter(tid => {
          const tAnns = byTask[Number(tid)];
          return tAnns.some(a => a.userId === a1) && tAnns.some(a => a.userId === a2);
        });

        if (sharedTaskIds.length < MIN_TASKS_FOR_IAA) continue;

        try {
          const labels1 = sharedTaskIds.map(tid => {
            const ann = byTask[Number(tid)].find(a => a.userId === a1);
            return ann?.label ?? "unknown";
          });
          const labels2 = sharedTaskIds.map(tid => {
            const ann = byTask[Number(tid)].find(a => a.userId === a2);
            return ann?.label ?? "unknown";
          });

          const taskContentsForLLM = sharedTaskIds.map(tid => {
            const ann = byTask[Number(tid)].find(a => a.userId === a1); // Assuming task content is same for both annotators on same task
            return ann?.taskContent ?? "";
          });

          const kappa = computeCohensKappa(labels1, labels2);
          const agreed = labels1.filter((l, idx) => l === labels2[idx]).length;
          const agreementPct = (agreed / sharedTaskIds.length) * 100;

          // LLM-based semantic agreement
          let llmSemanticAgreementCount = 0;
          for (let k = 0; k < sharedTaskIds.length; k++) {
            const llmScore = await llmSemanticCompareLabels(taskContentsForLLM[k], labels1[k], labels2[k]);
            if (llmScore !== null && llmScore >= 0.7) { // Threshold for semantic agreement
              llmSemanticAgreementCount++;
            }
          }
          const llmSemanticAgreementPct = (llmSemanticAgreementCount / sharedTaskIds.length) * 100;

          await db.insert(iaaScores).values({
            projectId,
            annotator1Id: a1,
            annotator2Id: a2,
            kappaCohens: kappa.toFixed(4),
            agreementPct: agreementPct.toFixed(2),
            llmSemanticAgreementPct: llmSemanticAgreementPct.toFixed(2), // New field
            taskCount: sharedTaskIds.length,
            computedAt: new Date(),
          });

          cohensCount++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log("warn", `Failed to compute Cohen's Kappa for annotators ${a1} and ${a2}`, {
            error: errorMsg,
          });
        }
      }
    }

    log("info", `Computed ${cohensCount} Cohen's Kappa scores for project ${projectId}`);

    // ── Fleiss' Kappa (project-level) ─────────────────────────────────────────
    if (annotatorIds.length >= 3) {
      try {
        const taskLabelsMap: Record<string, string[]> = {};
        for (const tid of multiAnnotatedTaskIds) {
          taskLabelsMap[tid] = byTask[Number(tid)].map(a => a.label);
        }

        const fleiss = computeFleissKappa(taskLabelsMap);

        // LLM-based semantic agreement for Fleiss' Kappa (simplified for now)
        // This would require a more complex LLM prompt to compare multiple labels
        // For simplicity, we'll just average pairwise semantic agreement if available
        let totalLlmSemanticAgreementPct = 0;
        let llmPairwiseScoresCount = 0;
        const existingPairwiseScores = await db.select({ llmSemanticAgreementPct: iaaScores.llmSemanticAgreementPct })
          .from(iaaScores)
          .where(and(eq(iaaScores.projectId, projectId), sql`${iaaScores.annotator1Id} IS NOT NULL`));
        
        for (const score of existingPairwiseScores) {
          if (score.llmSemanticAgreementPct) {
            totalLlmSemanticAgreementPct += parseFloat(score.llmSemanticAgreementPct);
            llmPairwiseScoresCount++;
          }
        }
        const fleissLlmSemanticAgreementPct = llmPairwiseScoresCount > 0 ? (totalLlmSemanticAgreementPct / llmPairwiseScoresCount) : null;

        await db.insert(iaaScores).values({
          projectId,
          annotator1Id: null,
          annotator2Id: null,
          fleissKappa: fleiss.toFixed(4),
          llmSemanticAgreementPct: fleissLlmSemanticAgreementPct ? fleissLlmSemanticAgreementPct.toFixed(2) : null, // New field
          taskCount: multiAnnotatedTaskIds.length,
          computedAt: new Date(),
        });

        log("info", `Computed Fleiss' Kappa for project ${projectId}`, {
          fleissKappa: fleiss.toFixed(4),
          taskCount: multiAnnotatedTaskIds.length,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log("error", `Failed to compute Fleiss' Kappa for project ${projectId}`, {
          error: errorMsg,
        });
      }
    }

    // Cleanup old scores
    await cleanupOldScores(db, projectId);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", `Failed to compute IAA for project ${projectId}`, {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// ─── Worker loop ──────────────────────────────────────────────────────────────

let _iaaIntervalId: ReturnType<typeof setInterval> | null = null;

export async function runIAAForAllProjects(): Promise<void> {
  const db = await getDb();
  if (!db) {
    log("error", "Database unavailable for IAA computation");
    return;
  }

  try {
    const { projects } = await import("../../drizzle/schema");
    const allProjects = await db.select({ id: projects.id }).from(projects);

    log("info", `Starting IAA computation for ${allProjects.length} projects`);

    let successCount = 0;
    let errorCount = 0;

    for (const project of allProjects) {
      try {
        await computeIAAForProject(project.id);
        successCount++;
      } catch (e) {
        errorCount++;
        const errorMsg = e instanceof Error ? e.message : String(e);
        log("error", `Failed to compute IAA for project ${project.id}`, {
          error: errorMsg,
        });
      }
    }

    log("info", `Completed IAA computation for ${allProjects.length} projects. Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("error", "Failed to run IAA for all projects", {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export function startIAAWorker(): void {
  if (_iaaIntervalId) {
    log("warn", "IAA Worker already started.");
    return;
  }
  log("info", "Starting IAA Worker...");
  runIAAForAllProjects(); // Run immediately on startup
  _iaaIntervalId = setInterval(runIAAForAllProjects, IAA_INTERVAL_MS);
}

export function stopIAAWorker(): void {
  if (_iaaIntervalId) {
    log("info", "Stopping IAA Worker...");
    clearInterval(_iaaIntervalId);
    _iaaIntervalId = null;
  }
}
