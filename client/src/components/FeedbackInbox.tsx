/**
 * FeedbackInbox — v4
 * ───────────────────
 * Full replacement for the basic feedback panel in TaskerDashboard.
 *
 * Features:
 *   - Grouped by status (rejected first, then approved, then pending)
 *   - Expandable cards with full task content + QA notes
 *   - Honey pot result badge (if applicable)
 *   - "Re-read guidelines" CTA on rejected items
 *   - Unread dot on new items (since last visit)
 */

import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  BookOpen, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { useState } from "react";

interface FeedbackItem {
  id: number;
  taskId?: number;
  taskContent?: string;
  status: "approved" | "rejected" | "pending_review";
  feedback?: string | null;
  isHoneyPotCheck?: boolean;
  honeyPotPassed?: boolean;
  createdAt: string | Date;
}

interface Props {
  items: FeedbackItem[];
  onViewGuidelines?: () => void;
}

type Filter = "all" | "rejected" | "approved";

export default function FeedbackInbox({ items, onViewGuidelines }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setExpanded(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Sort: rejected first, then pending, then approved
  const sorted = [...items].sort((a, b) => {
    const order = { rejected: 0, pending_review: 1, approved: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  const filtered = filter === "all"
    ? sorted
    : sorted.filter(f => f.status === filter);

  const rejectedCount  = items.filter(f => f.status === "rejected").length;
  const approvedCount  = items.filter(f => f.status === "approved").length;
  const pendingCount   = items.filter(f => f.status === "pending_review").length;

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 text-base">صندوق الملاحظات</h2>
            <div className="flex gap-2">
              {rejectedCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full">
                  {rejectedCount} مرفوض
                </span>
              )}
              {pendingCount > 0 && (
                <span className="bg-amber-100 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full">
                  {pendingCount} قيد المراجعة
                </span>
              )}
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2">
            {(["all", "rejected", "approved"] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all",
                  filter === f
                    ? f === "rejected"
                      ? "bg-red-100 text-red-700"
                      : f === "approved"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {f === "all" ? `الكل (${items.length})` :
                 f === "rejected" ? `مرفوض (${rejectedCount})` :
                 `مقبول (${approvedCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* ── Guideline CTA (shown when rejections exist) ────────── */}
        {rejectedCount > 0 && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              لديك {rejectedCount} تسليم مرفوض. راجع إرشادات التوسيم لتحسين دقتك.
            </p>
            {onViewGuidelines && (
              <button
                onClick={onViewGuidelines}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-all"
              >
                <BookOpen size={12} /> الإرشادات
              </button>
            )}
          </div>
        )}

        {/* ── Items ──────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="p-14 text-center text-slate-400">
            <CheckCircle2 className="w-9 h-9 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد ملاحظات بعد</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(f => {
              const isExpanded = expanded.has(f.id);
              const isRejected = f.status === "rejected";
              const isApproved = f.status === "approved";
              const isPending  = f.status === "pending_review";

              return (
                <div
                  key={f.id}
                  className={cn(
                    "transition-colors",
                    isRejected ? "bg-red-50/40" : isApproved ? "" : "bg-amber-50/20"
                  )}
                >
                  {/* ── Item header (always visible) ── */}
                  <button
                    className="w-full text-right px-5 py-4 flex items-start gap-3 hover:bg-slate-50/50 transition-colors"
                    onClick={() => toggle(f.id)}
                  >
                    {/* Status icon */}
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                      isApproved ? "bg-emerald-100" :
                      isRejected ? "bg-red-100"     : "bg-slate-100"
                    )}>
                      {isApproved ? <CheckCircle2 size={14} className="text-emerald-600" /> :
                       isRejected ? <XCircle      size={14} className="text-red-600"     /> :
                                    <Clock        size={14} className="text-slate-500"   />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Status + date row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-xs font-bold",
                          isApproved ? "text-emerald-600" :
                          isRejected ? "text-red-600"     : "text-amber-600"
                        )}>
                          {isApproved ? "✅ مقبول" : isRejected ? "❌ مرفوض" : "⏳ قيد المراجعة"}
                        </span>

                        {/* Honey pot badge */}
                        {f.isHoneyPotCheck && (
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            f.honeyPotPassed
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          )}>
                            🍯 {f.honeyPotPassed ? "HP ✓" : "HP ✗"}
                          </span>
                        )}

                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(f.createdAt).toLocaleString("ar-SA", {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Task content preview */}
                      <p className="text-sm text-slate-700 line-clamp-2 leading-relaxed" dir="rtl">
                        {f.taskContent ?? `مهمة #${f.taskId ?? f.id}`}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-slate-400 mt-1">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {/* ── Expanded detail ── */}
                  {isExpanded && (
                    <div className="px-5 pb-4 mr-11 space-y-3">
                      {/* Full task content */}
                      <div className="p-3 bg-white border border-slate-100 rounded-xl text-sm text-slate-700 leading-relaxed" dir="rtl">
                        {f.taskContent ?? "—"}
                      </div>

                      {/* QA feedback */}
                      {f.feedback && (
                        <div className={cn(
                          "p-3 rounded-xl text-sm leading-relaxed border",
                          isRejected
                            ? "bg-red-50 border-red-100 text-red-800"
                            : "bg-emerald-50 border-emerald-100 text-emerald-800"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            {isRejected
                              ? <XCircle size={13} className="text-red-500" />
                              : <ShieldCheck size={13} className="text-emerald-500" />}
                            <span className="font-semibold text-xs">ملاحظة المراجع:</span>
                          </div>
                          {f.feedback}
                        </div>
                      )}

                      {/* Honey pot explanation */}
                      {f.isHoneyPotCheck && !f.honeyPotPassed && (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
                          🍯 هذه المهمة كانت <strong>Honey Pot</strong> — مهمة تحقق من الجودة بإجابة محددة مسبقاً. يؤثر عدم اجتيازها على تقييمك.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
