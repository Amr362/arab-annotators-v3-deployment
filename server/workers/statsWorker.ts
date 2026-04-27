/**
 * StatsWorker — v4
 * ─────────────────
 * Recomputes worker_metrics for every (user, project) pair every 60s.
 *
 * Metrics computed:
 *   - totalAnnotations, qaPassed, qaFailed
 *   - honeyPotTotal, honeyPotPassed, honeyPotAccuracy
 *   - qaPassRate, avgTimeSeconds
 *   - Skill level auto-promotion (3 levels, threshold-based)
 *   - Auto-suspension if honeyPotAccuracy < 0.50
 *
 * To start the worker:
 *   import { startStatsWorker } from './statsWorker'
 *   startStatsWorker()  // call once at server startup
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  annotations,
  qaReviews,
  tasks,
  users,
  workerMetrics,
} from "../../drizzle/schema";

const RECOMPUTE_INTERVAL_MS = 60_000; // 60 seconds

// ─── Thresholds for skill auto-promotion ─────────────────────────────────────

const SKILL_THRESHOLDS = [
  { level: 2, minAnnotations: 50, minQaPassRate: 0.85, minHpAccuracy: 0.90 },
  { level: 3, minAnnotations: 200, minQaPassRate: 0.90, minHpAccuracy: 0.95 },
  { level: 4, minAnnotations: 500, minQaPassRate: 0.93, minHpAccuracy: 0.97 },
  { level: 5, minAnnotations: 1000, minQaPassRate: 0.95, minHpAccuracy: 0.99 },
];

const HP_SUSPEND_THRESHOLD = 0.50; // suspend if HP accuracy drops below 50%
const HP_MIN_SAMPLES = 5;         // don't suspend until at least 5 honey pots seen

// ─── Core recompute logic ─────────────────────────────────────────────────────

export async function recomputeMetrics(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all (user_id, project_id) pairs with annotations
  const pairs = await db
    .selectDistinct({ userId: annotations.userId, projectId: tasks.projectId })
    .from(annotations)
    .innerJoin(tasks, eq(annotations.taskId, tasks.id))
    .where(eq(annotations.isDraft, false));

  for (const { userId, projectId } of pairs) {
    try {
      await recomputeForWorker(userId, projectId);
    } catch (e) {
      console.error(`[StatsWorker] Failed for user=${userId} project=${projectId}:`, e);
    }
  }
}

async function recomputeForWorker(userId: number, projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // All non-draft annotations by this worker on this project
  const workerAnnotations = await db
    .select({
      id: annotations.id,
      taskId: annotations.taskId,
      timeSpentSeconds: annotations.timeSpentSeconds,
      isHoneyPotCheck: annotations.isHoneyPotCheck,
      honeyPotPassed: annotations.honeyPotPassed,
    })
    .from(annotations)
    .innerJoin(tasks, eq(annotations.taskId, tasks.id))
    .where(
      and(
        eq(annotations.userId, userId),
        eq(tasks.projectId, projectId),
        eq(annotations.isDraft, false)
      )
    );

  if (workerAnnotations.length === 0) return;

  const annIds = workerAnnotations.map(a => a.id);

  // QA reviews for these annotations
  const reviews = await db
    .select({ status: qaReviews.status, annotationId: qaReviews.annotationId })
    .from(qaReviews)
    .where(sql`${qaReviews.annotationId} = ANY(ARRAY[${sql.join(annIds.map(id => sql`${id}`), sql`, `)}]::int[])`);

  const qaPassed = reviews.filter(r => r.status === "approved").length;
  const qaFailed = reviews.filter(r => r.status === "rejected").length;

  const honeyPotAnns = workerAnnotations.filter(a => a.isHoneyPotCheck);
  const honeyPotTotal = honeyPotAnns.length;
  const honeyPotPassed = honeyPotAnns.filter(a => a.honeyPotPassed === true).length;

  const totalAnnotations = workerAnnotations.length;
  const qaTotal = qaPassed + qaFailed;
  const qaPassRate = qaTotal > 0 ? qaPassed / qaTotal : 0;
  const honeyPotAccuracy = honeyPotTotal > 0 ? honeyPotPassed / honeyPotTotal : 0;

  const totalTime = workerAnnotations.reduce((sum, a) => sum + (a.timeSpentSeconds ?? 0), 0);
  const avgTimeSeconds = totalAnnotations > 0 ? totalTime / totalAnnotations : 0;

  // Upsert worker_metrics
  const existing = await db
    .select({ id: workerMetrics.id })
    .from(workerMetrics)
    .where(and(eq(workerMetrics.userId, userId), eq(workerMetrics.projectId, projectId)))
    .limit(1);

  const metricsData = {
    userId,
    projectId,
    totalAnnotations,
    qaPassed,
    qaFailed,
    honeyPotTotal,
    honeyPotPassed,
    avgTimeSeconds: avgTimeSeconds.toFixed(2),
    qaPassRate: qaPassRate.toFixed(4),
    honeyPotAccuracy: honeyPotAccuracy.toFixed(4),
    computedAt: new Date(),
  };

  if (existing.length) {
    await db
      .update(workerMetrics)
      .set(metricsData)
      .where(eq(workerMetrics.id, existing[0].id));
  } else {
    await db.insert(workerMetrics).values(metricsData);
  }

  // ── Skill auto-promotion ──────────────────────────────────────────────────
  const workerRow = await db
    .select({ skillLevel: users.skillLevel, isSuspended: users.isSuspended })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const worker = workerRow[0];
  if (!worker || worker.isSuspended) return;

  // Check promotion eligibility
  for (const tier of SKILL_THRESHOLDS) {
    if (
      (worker.skillLevel ?? 1) < tier.level &&
      totalAnnotations >= tier.minAnnotations &&
      qaPassRate >= tier.minQaPassRate &&
      honeyPotAccuracy >= tier.minHpAccuracy
    ) {
      await db
        .update(users)
        .set({ skillLevel: tier.level, updatedAt: new Date() })
        .where(eq(users.id, userId));
      console.log(`[StatsWorker] User ${userId} promoted to skill level ${tier.level}`);
      break;
    }
  }

  // ── Auto-suspension check ─────────────────────────────────────────────────
  if (
    honeyPotTotal >= HP_MIN_SAMPLES &&
    honeyPotAccuracy < HP_SUSPEND_THRESHOLD &&
    !(worker.isSuspended)
  ) {
    await db
      .update(users)
      .set({
        isSuspended: true,
        isAvailable: false,
        suspendedAt: new Date(),
        suspendReason: `Honey pot accuracy ${Math.round(honeyPotAccuracy * 100)}% below threshold (${Math.round(HP_SUSPEND_THRESHOLD * 100)}%)`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    console.warn(`[StatsWorker] User ${userId} auto-suspended. HP accuracy: ${honeyPotAccuracy}`);
  }
}

// ─── Worker loop ──────────────────────────────────────────────────────────────

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startStatsWorker(): void {
  if (_intervalId) return; // Already running

  console.log("[StatsWorker] Starting — recompute every 60s");
  _intervalId = setInterval(async () => {
    try {
      await recomputeMetrics();
    } catch (e) {
      console.error("[StatsWorker] Recompute error:", e);
    }
  }, RECOMPUTE_INTERVAL_MS);

  // Run immediately on start
  recomputeMetrics().catch(e => console.error("[StatsWorker] Initial run error:", e));
}

export function stopStatsWorker(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
