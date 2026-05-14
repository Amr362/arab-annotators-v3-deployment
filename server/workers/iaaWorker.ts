/**
 * IAAWorker — v4 (Enhanced)
 * ───────────────────────────
 * Computes Inter-Annotator Agreement (IAA) scores and stores them in iaa_scores.
 *
 * Computed metrics:
 *   - Cohen's Kappa (pairwise, for 2 annotators)
 *   - Fleiss' Kappa (multi-annotator, for 3+ annotators)
 *   - Raw agreement percentage
 *
 * Runs on a scheduled interval (every 5 minutes by default).
 * Can also be triggered on-demand via the manager router.
 *
 * Enhancements:
 *   - Better error handling and validation
 *   - Cleanup of old IAA scores
 *   - Improved logging
 *   - Edge case handling
 *   - Performance optimizations
 */

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import { annotations, tasks, iaaScores } from "../../drizzle/schema";

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
    const byTask: Record<number, { userId: number; label: string }[]> = {};
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
        byTask[row.taskId].push({ userId: row.userId, label: labelStr });
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

          const kappa = computeCohensKappa(labels1, labels2);
          const agreed = labels1.filter((l, idx) => l === labels2[idx]).length;
          const agreementPct = (agreed / sharedTaskIds.length) * 100;

          await db.insert(iaaScores).values({
            projectId,
            annotator1Id: a1,
            annotator2Id: a2,
            kappaCohens: kappa.toFixed(4),
            agreementPct: agreementPct.toFixed(2),
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

        await db.insert(iaaScores).values({
          projectId,
          annotator1Id: null,
          annotator2Id: null,
          fleissKappa: fleiss.toFixed(4),
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

    log("info", `IAA computation completed`, {
      total: allProjects.length,
      success: successCount,
      errors: errorCount,
    });
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
    log("warn", "IAA worker already running");
    return;
  }

  log("info", "Starting IAA worker — recompute every 5 minutes");
  
  // Run immediately on startup
  runIAAForAllProjects().catch(e => {
    const errorMsg = e instanceof Error ? e.message : String(e);
    log("error", "Initial IAA run failed", { error: errorMsg });
  });

  // Then run on interval
  _iaaIntervalId = setInterval(async () => {
    try {
      await runIAAForAllProjects();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      log("error", "IAA worker interval execution failed", { error: errorMsg });
    }
  }, IAA_INTERVAL_MS);
}

export function stopIAAWorker(): void {
  if (_iaaIntervalId) {
    clearInterval(_iaaIntervalId);
    _iaaIntervalId = null;
    log("info", "IAA worker stopped");
  }
}
