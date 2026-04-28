/**
 * WorkerMetricsCard — v4
 * ───────────────────────
 * Shows the worker's own skill metrics inside the profile panel.
 * Pulls from workerMetrics.getForWorker — live data from StatsWorker.
 *
 * Displays:
 *   - Skill level (with auto-promotion thresholds visualised)
 *   - QA pass rate bar
 *   - Honey pot accuracy bar
 *   - Next-level requirements checklist
 *   - Suspension warning if applicable
 */

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ShieldCheck, TrendingUp, Star, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const SKILL_TIERS = [
  { level: 1, name: "مبتدئ",    color: "#94a3b8", min: 0    },
  { level: 2, name: "متقدم",    color: "#3b82f6", min: 50   },
  { level: 3, name: "محترف",   color: "#22c55e", min: 200  },
  { level: 4, name: "خبير",     color: "#8b5cf6", min: 500  },
  { level: 5, name: "متميّز",   color: "#f59e0b", min: 1000 },
] as const;

const PROMOTION_REQS: Record<number, { minAnns: number; minQA: number; minHP: number }> = {
  2: { minAnns: 50,   minQA: 0.85, minHP: 0.90 },
  3: { minAnns: 200,  minQA: 0.90, minHP: 0.95 },
  4: { minAnns: 500,  minQA: 0.93, minHP: 0.97 },
  5: { minAnns: 1000, minQA: 0.95, minHP: 0.99 },
};

interface Props {
  projectId?: number;
}

export default function WorkerMetricsCard({ projectId }: Props) {
  const { data: allMetrics = [], isLoading } = trpc.workerMetrics.getForWorker.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const metric = projectId
    ? allMetrics.find(m => m.projectId === projectId)
    : allMetrics[0];

  if (isLoading) return <SkeletonCard />;
  if (!metric) return null;

  const total    = metric.totalAnnotations;
  const qaRate   = Number(metric.qaPassRate ?? 0);
  const hpRate   = Number(metric.honeyPotAccuracy ?? 0);
  const skillLvl = SKILL_TIERS.find(t => t.level === 1) ?? SKILL_TIERS[0]; // from user context ideally

  const nextTier = SKILL_TIERS[1]; // will be derived from current level in real usage
  const nextReqs = PROMOTION_REQS[2];

  // Determine if any requirement is blocking promotion
  const reqsMet = nextReqs ? [
    { label: `${nextReqs.minAnns} تسليم مقبول`, met: total >= nextReqs.minAnns, current: total, target: nextReqs.minAnns },
    { label: `دقة QA ≥ ${Math.round(nextReqs.minQA * 100)}%`, met: qaRate >= nextReqs.minQA, current: Math.round(qaRate * 100), target: Math.round(nextReqs.minQA * 100) },
    { label: `دقة HP ≥ ${Math.round(nextReqs.minHP * 100)}%`, met: hpRate >= nextReqs.minHP, current: Math.round(hpRate * 100), target: Math.round(nextReqs.minHP * 100) },
  ] : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-2">
        <Star size={14} className="text-amber-400" />
        <h3 className="text-sm font-bold text-slate-700">مقاييس الجودة</h3>
        <span className="text-xs text-slate-400 mr-auto">من StatsWorker · تحديث كل دقيقة</span>
      </div>

      <div className="p-5 space-y-5">

        {/* QA Pass Rate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} className={qaRate >= 0.90 ? "text-green-500" : qaRate >= 0.70 ? "text-yellow-500" : "text-red-400"} />
              <span className="text-xs font-semibold text-slate-600">دقة QA</span>
            </div>
            <span className={cn(
              "text-sm font-black",
              qaRate >= 0.90 ? "text-green-600" :
              qaRate >= 0.70 ? "text-yellow-600" : "text-red-600"
            )}>
              {Math.round(qaRate * 100)}%
            </span>
          </div>
          <RatioBar value={qaRate} good={0.90} warn={0.70} />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>مقبول: {metric.qaPassed}</span>
            <span>مرفوض: {metric.qaFailed}</span>
          </div>
        </div>

        {/* Honey Pot Accuracy */}
        {Number(metric.honeyPotTotal) > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🍯</span>
                <span className="text-xs font-semibold text-slate-600">دقة Honey Pot</span>
              </div>
              <span className={cn(
                "text-sm font-black",
                hpRate >= 0.90 ? "text-green-600" :
                hpRate >= 0.60 ? "text-yellow-600" : "text-red-600"
              )}>
                {Math.round(hpRate * 100)}%
              </span>
            </div>
            <RatioBar value={hpRate} good={0.90} warn={0.60} />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>اجتاز: {metric.honeyPotPassed}</span>
              <span>الكل: {metric.honeyPotTotal}</span>
            </div>

            {hpRate < 0.50 && (
              <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-2.5 text-xs text-red-700">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                دقة Honey Pot أقل من 50% — خطر الإيقاف التلقائي
              </div>
            )}
          </div>
        )}

        {/* Avg time */}
        {Number(metric.avgTimeSeconds) > 0 && (
          <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-xl">
            <span className="text-xs text-slate-500">متوسط وقت المهمة</span>
            <span className="text-sm font-bold text-slate-700">
              {formatDuration(Number(metric.avgTimeSeconds))}
            </span>
          </div>
        )}

        {/* Next-level requirements */}
        {reqsMet.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <TrendingUp size={12} className="text-indigo-400" />
              متطلبات الترقية للمستوى التالي
            </p>
            <div className="space-y-1.5">
              {reqsMet.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  {r.met
                    ? <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                    : <XCircle      size={13} className="text-slate-300 flex-shrink-0" />}
                  <span className={cn("text-xs", r.met ? "text-green-700" : "text-slate-500")}>
                    {r.label}
                  </span>
                  {!r.met && (
                    <span className="mr-auto text-[10px] text-slate-400">
                      {r.current} / {r.target}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RatioBar({ value, good, warn }: { value: number; good: number; warn: number }) {
  const pct = Math.min(value * 100, 100);
  const color = value >= good ? "#22c55e" : value >= warn ? "#f59e0b" : "#ef4444";
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} ثانية`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}د ${s}ث` : `${m} دقيقة`;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-4 bg-slate-100 rounded-full" style={{ width: `${80 - i * 10}%` }} />
      ))}
    </div>
  );
}
