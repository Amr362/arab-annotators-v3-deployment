/**
 * WorkerProgressTracker — v4
 * ───────────────────────────
 * Inline progress strip shown at the top of the annotate panel.
 * Displays:
 *   - Tasks done today vs daily goal
 *   - Animated progress ring
 *   - Active streak flame
 *   - Real-time QA pass rate + HP accuracy from worker_metrics
 */

import { trpc } from "@/lib/trpc";
import { Flame, Target, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  projectId: number;
  dailyGoal?: number;
  completedToday?: number;
  streak?: number;
}

export default function WorkerProgressTracker({
  projectId,
  dailyGoal = 20,
  completedToday = 0,
  streak = 0,
}: Props) {
  const { data: myMetrics } = trpc.workerMetrics.getForWorker.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const projectMetric = (myMetrics ?? []).find(
    m => m.projectId === projectId
  );

  const qaPassRate   = projectMetric ? Math.round(Number(projectMetric.qaPassRate) * 100)   : null;
  const hpAccuracy   = projectMetric ? Math.round(Number(projectMetric.honeyPotAccuracy) * 100) : null;
  const totalDone    = projectMetric?.totalAnnotations ?? 0;
  const goalPct      = Math.min((completedToday / dailyGoal) * 100, 100);
  const goalReached  = completedToday >= dailyGoal;

  // SVG ring params
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - goalPct / 100);

  return (
    <div className="flex items-center gap-4 px-5 py-3 bg-white border-b border-slate-100 flex-wrap">

      {/* Progress ring */}
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg width="56" height="56" className="rotate-[-90deg]">
          <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
          <circle
            cx="28" cy="28" r={r} fill="none"
            stroke={goalReached ? "#00D4A8" : "#6366f1"}
            strokeWidth="4"
            strokeDasharray={circ}
            strokeDashoffset={dash}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-black text-slate-800 leading-none">{completedToday}</span>
          <span className="text-[8px] text-slate-400">/{dailyGoal}</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex gap-5 flex-wrap flex-1 min-w-0">

        {/* Daily progress */}
        <MetricPill
          icon={<CheckCircle2 size={13} className={goalReached ? "text-[#00D4A8]" : "text-slate-400"} />}
          label="اليوم"
          value={goalReached ? "✅ هدف محقق!" : `${completedToday} / ${dailyGoal}`}
          highlight={goalReached}
        />

        {/* Streak */}
        {streak > 0 && (
          <MetricPill
            icon={<Flame size={13} className="text-orange-400" />}
            label="سلسلة"
            value={`${streak} يوم 🔥`}
            highlight={streak >= 7}
          />
        )}

        {/* QA pass rate */}
        {qaPassRate !== null && (
          <MetricPill
            icon={<Target size={13} className={
              qaPassRate >= 90 ? "text-green-500" :
              qaPassRate >= 70 ? "text-yellow-500" : "text-red-400"
            } />}
            label="دقة QA"
            value={`${qaPassRate}%`}
            highlight={qaPassRate >= 90}
            warn={qaPassRate < 70}
          />
        )}

        {/* HP accuracy */}
        {hpAccuracy !== null && (
          <MetricPill
            icon={<span className="text-[11px]">🍯</span>}
            label="دقة HP"
            value={`${hpAccuracy}%`}
            highlight={hpAccuracy >= 90}
            warn={hpAccuracy < 60}
          />
        )}

        {/* Total ever */}
        {totalDone > 0 && (
          <MetricPill
            icon={<Clock size={13} className="text-slate-300" />}
            label="الإجمالي"
            value={totalDone.toLocaleString("ar")}
          />
        )}
      </div>

      {/* Suspended warning */}
      {hpAccuracy !== null && hpAccuracy < 50 && (
        <div className="w-full text-xs bg-red-50 border border-red-100 text-red-700 rounded-xl px-3 py-2 flex items-center gap-2">
          ⚠️ دقة Honey Pot منخفضة — خطر الإيقاف التلقائي إذا استمر الانخفاض عن 50%
        </div>
      )}
    </div>
  );
}

function MetricPill({
  icon, label, value, highlight, warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center px-3 py-1.5 rounded-xl border text-center min-w-[60px]",
      highlight ? "bg-emerald-50 border-emerald-100" :
      warn      ? "bg-red-50 border-red-100" :
                  "bg-slate-50 border-slate-100"
    )}>
      <div className="flex items-center gap-1 mb-0.5">{icon}</div>
      <span className={cn(
        "text-xs font-bold leading-tight",
        highlight ? "text-emerald-700" : warn ? "text-red-600" : "text-slate-700"
      )}>{value}</span>
      <span className="text-[9px] text-slate-400 leading-tight">{label}</span>
    </div>
  );
}
