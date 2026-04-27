/**
 * IAAWorker — v4
 * ───────────────
 * Computes Inter-Annotator Agreement (IAA) scores and stores them in iaa_scores.
 *
 * Computed metrics:
 *   - Cohen's Kappa (pairwise, for 2 annotators)
 *   - Fleiss' Kappa (multi-annotator, for 3+ annotators)
 *   - Raw agreement percentage
 *
 * Runs on a scheduled interval (every 5 minutes by default).
 * Can also be triggered on-demand via the manager router.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { annotations, tasks, iaaScores } from "../../drizzle/schema";

const IAA_INTERVAL_MS = 5 * 60_000; // 5 minutes

// ─── Cohen's Kappa ────────────────────────────────────────────────────────────

/**
 * Compute Cohen's Kappa for two annotators on a shared set of tasks.
 * κ = (Po - Pe) / (1 - Pe)
 * where Po = observed agreement, Pe = expected agreement by chance
 */
export function computeCohensKappa(
  labels1: string[],
  labels2: string[]
): number {
  if (labels1.length !== labels2.length || labels1.length === 0) return 0;

  const n = labels1.length;

  // Observed agreement
  const agreed = labels1.filter((l, i) => l === labels2[i]).length;
  const po = agreed / n;

  // Get unique labels across both
  const allLabels = [...new Set([...labels1, ...labels2])];

  // Expected agreement by chance
  let pe = 0;
  for (const label of allLabels) {
    const p1 = labels1.filter(l => l === label).length / n;
    const p2 = labels2.filter(l => l === label).length / n;
    pe += p1 * p2;
  }

  if (pe === 1) return 1; // perfect expected = trivial
  return (po - pe) / (1 - pe);
}

// ─── Fleiss' Kappa ────────────────────────────────────────────────────────────

/**
 * Compute Fleiss' Kappa for N annotators on shared tasks.
 * annotatorMatrix: array of maps { taskId → label } per annotator
 */
export function computeFleissKappa(
  taskLabels: Record<string, string[]> // taskId → array of labels from each annotator
): number {
  const taskIds = Object.keys(taskLabels);
  if (taskIds.length === 0) return 0;

  const allLabels = [...new Set(Object.values(taskLabels).flat())];
  const n = taskIds.length;

  // Annotators per task (assume all tasks have same number of annotators)
  const k = Math.max(...taskIds.map(tid => taskLabels[tid].length));
  if (k < 2) return 0;

  // P_j: proportion of all assignments that were category j
  const labelCounts: Record<string, number> = {};
  for (const tid of taskIds) {
    for (const label of taskLabels[tid]) {
      labelCounts[label] = (labelCounts[label] ?? 0) + 1;
    }
  }
  const totalAssignments = n * k;

  // P_i: extent of agreement for item i
  let sumPi = 0;
  for (const tid of taskIds) {
    const tLabels = taskLabels[tid];
    let taskAgreement = 0;
    for (const label of allLabels) {
      const count = tLabels.filter(l => l === label).length;
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

  if (pE === 1) return 1;
  return (pBar - pE) / (1 - pE);
}

// ─── IAA computation for a project ───────────────────────────────────────────

export async function computeIAAForProject(projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

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

  if (rows.length < 2) return;

  // Group by task
  const byTask: Record<number, { userId: number; label: string }[]> = {};
  for (const row of rows) {
    const result = row.result as any;
    const label =
      result?.labels?.[0] ??
      result?.choice ??
      result?.label ??
      JSON.stringify(result) ??
      "unknown";

    if (!byTask[row.taskId]) byTask[row.taskId] = [];
    byTask[row.taskId].push({ userId: row.userId, label: String(label).toLowerCase().trim() });
  }

  // Only tasks with ≥ 2 annotations are useful for IAA
  const multiAnnotatedTaskIds = Object.keys(byTask).filter(
    tid => byTask[Number(tid)].length >= 2
  );

  if (multiAnnotatedTaskIds.length < 5) return; // need meaningful sample

  // Get unique annotator pairs
  const annotatorIds = [...new Set(rows.map(r => r.userId))];

  // ── Pairwise Cohen's Kappa ────────────────────────────────────────────────
  for (let i = 0; i < annotatorIds.length; i++) {
    for (let j = i + 1; j < annotatorIds.length; j++) {
      const a1 = annotatorIds[i];
      const a2 = annotatorIds[j];

      // Find tasks where BOTH annotators have annotations
      const sharedTaskIds = multiAnnotatedTaskIds.filter(tid => {
        const tAnns = byTask[Number(tid)];
        return tAnns.some(a => a.userId === a1) && tAnns.some(a => a.userId === a2);
      });

      if (sharedTaskIds.length < 5) continue; // insufficient overlap

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
    }
  }

  // ── Fleiss' Kappa (project-level) ─────────────────────────────────────────
  if (annotatorIds.length >= 3) {
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
  }
}

// ─── Worker loop ──────────────────────────────────────────────────────────────

let _iaaIntervalId: ReturnType<typeof setInterval> | null = null;

export async function runIAAForAllProjects(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { projects } = await import("../../drizzle/schema");
  const allProjects = await db.select({ id: projects.id }).from(projects);

  for (const project of allProjects) {
    try {
      await computeIAAForProject(project.id);
    } catch (e) {
      console.error(`[IAAWorker] Failed for project ${project.id}:`, e);
    }
  }
}

export function startIAAWorker(): void {
  if (_iaaIntervalId) return;

  console.log("[IAAWorker] Starting — recompute every 5 minutes");
  _iaaIntervalId = setInterval(async () => {
    try {
      await runIAAForAllProjects();
    } catch (e) {
      console.error("[IAAWorker] Error:", e);
    }
  }, IAA_INTERVAL_MS);

  runIAAForAllProjects().catch(e => console.error("[IAAWorker] Initial run error:", e));
}

export function stopIAAWorker(): void {
  if (_iaaIntervalId) {
    clearInterval(_iaaIntervalId);
    _iaaIntervalId = null;
  }
}
