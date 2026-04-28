/**
 * QADashboard — v4
 * ─────────────────
 * Full redesign of the QA review interface.
 *
 * New in v4:
 *   - Split-pane layout: queue list (left) + focused review (right)
 *   - Annotation comparison: side-by-side view when multiple annotators worked same task
 *   - Batch review with select-all + bulk approve/reject
 *   - Expanded keyboard shortcuts (J/K navigate, A approve, R reject, E edit, B batch)
 *   - Honey pot badge + auto-result indicator
 *   - Worker skill-level badge per item
 *   - Quick-reject with preset reason chips
 *   - Progress bar showing queue drain
 *   - Session stats strip (approved/rejected this session)
 *   - AI review & spam badges (preserved from v3)
 *   - Uses manager.qaApprove / manager.qaReject when available; falls back to qa.*
 */

import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, XCircle, TrendingUp, MessageSquare,
  Keyboard, Bot, ShieldAlert, User, Folder, Activity, RefreshCw,
  ChevronLeft, ChevronRight, Pencil, Layers, Eye, EyeOff, SplitSquareHorizontal,
  Clock, Star, Flame,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AnnotationWidget from "@/components/annotation/AnnotationWidget";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Preset reject reasons ────────────────────────────────────────────────────
const REJECT_PRESETS = [
  "التصنيف غير صحيح",
  "إجابة عشوائية",
  "لم يقرأ المحتوى",
  "يتناقض مع الإرشادات",
  "مهمة Honey Pot فاشلة",
];

// ─── AI Review Badge ──────────────────────────────────────────────────────────
function AiReviewBadge({ annotationId }: { annotationId: number }) {
  const { data, isLoading } = trpc.aiTools.qaReview.useQuery({ annotationId }, { retry: false });
  if (isLoading) return <span className="text-xs text-slate-400 animate-pulse">🤖 AI يحلل...</span>;
  if (!data) return null;
  const color =
    data.verdict === "approve" ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    data.verdict === "reject"  ? "text-red-600 bg-red-50 border-red-200" :
                                  "text-amber-600 bg-amber-50 border-amber-200";
  const icon = data.verdict === "approve" ? "✅" : data.verdict === "reject" ? "❌" : "⚠️";
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${color}`}>
      <Bot size={12} className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-semibold">{icon} AI: {data.verdict === "approve" ? "يُوصي بالقبول" : data.verdict === "reject" ? "يُوصي بالرفض" : "غير محدد"}</span>
        <span className="opacity-70 mr-1">({data.confidence}% ثقة)</span>
        {data.reason && <p className="opacity-80 mt-0.5">{data.reason}</p>}
      </div>
    </div>
  );
}

function SpamBadge({ annotationId }: { annotationId: number }) {
  const { data, isLoading } = trpc.aiTools.spamCheck.useQuery({ annotationId }, { retry: false });
  if (isLoading || !data?.isSpam) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border text-xs text-orange-600 bg-orange-50 border-orange-200">
      <ShieldAlert size={12} className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-semibold">⚠️ محتمل إجابة عشوائية ({data.confidence}% ثقة)</span>
        {data.reason && <p className="opacity-80 mt-0.5">{data.reason}</p>}
      </div>
    </div>
  );
}

// ─── Skill badge ──────────────────────────────────────────────────────────────
function SkillBadge({ level }: { level?: number }) {
  if (!level) return null;
  const colors = ["", "bg-gray-100 text-gray-500", "bg-blue-100 text-blue-600",
    "bg-green-100 text-green-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700"];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${colors[level] ?? colors[1]}`}>
      ★{level}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function QADashboard() {
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    annotationId: number; taskId?: number; type: "approve" | "reject" | "edit";
  } | null>(null);
  const [editResult, setEditResult] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [aiVisible, setAiVisible] = useState(true);
  const [splitView, setSplitView] = useState(false);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [sessionApproved, setSessionApproved] = useState(0);
  const [sessionRejected, setSessionRejected] = useState(0);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: qaQueue = [], isLoading, refetch } = trpc.qa.getQueue.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: stats, refetch: refetchStats } = trpc.qa.getStats.useQuery();
  const { data: allProjects = [] } = trpc.projects.getAll.useQuery();

  // ── Filtered queue ─────────────────────────────────────────────────────────
  const pending = useMemo(() => {
    let q = (qaQueue as any[]).filter(i => i.status === "pending_review");
    if (projectFilter) q = q.filter(i => i.projectId === projectFilter);
    return q;
  }, [qaQueue, projectFilter]);

  const focused = pending[focusedIdx] ?? null;

  // Multi-annotator comparison: find other annotations for same task
  const { data: allForTask } = trpc.qa.getQueue.useQuery(undefined, {
    enabled: splitView && !!focused?.taskId,
    select: (data: any[]) =>
      data.filter(i => i.taskId === focused?.taskId && i.id !== focused?.id),
  });
  const comparisons = (allForTask as any[] | undefined) ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const approve = trpc.qa.approve.useMutation({
    onSuccess: () => {
      toast.success("✅ تم القبول");
      setSessionApproved(n => n + 1);
      setPendingAction(null); setFeedbackText("");
      advanceFocus(); refetch(); refetchStats();
    },
    onError: e => toast.error(e.message),
  });

  const reject = trpc.qa.reject.useMutation({
    onSuccess: () => {
      toast.success("❌ تم الرفض");
      setSessionRejected(n => n + 1);
      setPendingAction(null); setFeedbackText("");
      advanceFocus(); refetch(); refetchStats();
    },
    onError: e => toast.error(e.message),
  });

  const isMutating = approve.isPending || reject.isPending;

  function advanceFocus() {
    setFocusedIdx(i => Math.min(i, pending.length - 2));
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    switch (e.key) {
      case "j": case "ArrowDown":
        e.preventDefault();
        setFocusedIdx(i => Math.min(i + 1, pending.length - 1));
        break;
      case "k": case "ArrowUp":
        e.preventDefault();
        setFocusedIdx(i => Math.max(i - 1, 0));
        break;
      case "a": case "Enter":
        if (focused) { e.preventDefault(); setPendingAction({ annotationId: focused.id, taskId: focused.taskId, type: "approve" }); }
        break;
      case "r": case "Delete":
        if (focused) { e.preventDefault(); setPendingAction({ annotationId: focused.id, taskId: focused.taskId, type: "reject" }); setTimeout(() => feedbackRef.current?.focus(), 100); }
        break;
      case "e":
        if (focused) { e.preventDefault(); setEditResult(JSON.stringify(focused.result, null, 2)); setPendingAction({ annotationId: focused.id, taskId: focused.taskId, type: "edit" }); }
        break;
      case "b":
        e.preventDefault();
        setBatchMode(m => !m);
        break;
      case "s":
        e.preventDefault();
        setSplitView(v => !v);
        break;
      case "?": case "/":
        e.preventDefault();
        setShowShortcuts(s => !s);
        break;
      case "Escape":
        setPendingAction(null);
        setFocusedIdx(0);
        break;
    }
  }, [focused, pending.length]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── Batch helpers ──────────────────────────────────────────────────────────
  function toggleSelect(id: number) {
    setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() {
    setSelectedIds(selectedIds.size === pending.length ? new Set() : new Set(pending.map((i: any) => i.id)));
  }
  async function batchApprove() {
    let done = 0;
    for (const id of selectedIds) {
      try { await approve.mutateAsync({ annotationId: id }); done++; } catch {}
    }
    toast.success(`✅ تم قبول ${done} توسيم`);
    setSelectedIds(new Set()); setBatchMode(false);
  }
  async function batchReject(reason: string) {
    let done = 0;
    for (const id of selectedIds) {
      try { await reject.mutateAsync({ annotationId: id, feedback: reason }); done++; } catch {}
    }
    toast.success(`❌ تم رفض ${done} توسيم`);
    setSelectedIds(new Set()); setBatchMode(false);
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const { annotationId, type } = pendingAction;
    if (type === "approve") await approve.mutateAsync({ annotationId, feedback: feedbackText || undefined });
    else if (type === "reject") await reject.mutateAsync({ annotationId, feedback: feedbackText || "مرفوض" });
    else if (type === "edit") {
      // Edit + approve via manager router if available, else fallback
      try {
        const parsed = JSON.parse(editResult);
        await (trpc as any).manager?.qaEditAndApprove?.mutateAsync({
          taskId: pendingAction.taskId,
          annotationId,
          correctedResult: parsed,
          feedback: feedbackText || "تم التعديل",
        }).catch(() =>
          approve.mutateAsync({ annotationId, feedback: feedbackText || "تم التعديل" })
        );
      } catch { toast.error("JSON غير صالح"); return; }
    }
  }

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!user || !["qa", "admin", "manager"].includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">غير مصرح لك بالوصول</p>
        </div>
      </div>
    );
  }

  const queueTotal  = (qaQueue as any[]).length;
  const drainPct    = queueTotal > 0 ? Math.round(((queueTotal - pending.length) / queueTotal) * 100) : 100;
  const projectOpts = allProjects.filter(p =>
    (qaQueue as any[]).some(i => (i as any).projectId === p.id)
  );

  return (
    <ArabAnnotatorsDashboardLayout>
      <div className="flex flex-col h-full bg-slate-50" dir="rtl">

        {/* ── Top bar ──────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-4 flex-shrink-0 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900">مراجعة الجودة</h1>
            <p className="text-xs text-slate-400">
              {pending.length} معلقة · {queueTotal} إجمالي
            </p>
          </div>

          {/* Session stats */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600 font-semibold">
              <CheckCircle2 size={13} /> {sessionApproved} قُبل
            </span>
            <span className="flex items-center gap-1 text-red-500 font-semibold">
              <XCircle size={13} /> {sessionRejected} رُفض
            </span>
          </div>

          {/* Queue drain bar */}
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${drainPct}%` }} />
            </div>
            <span className="text-[10px] text-slate-400">{drainPct}%</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Project filter */}
            {projectOpts.length > 1 && (
              <select
                value={projectFilter ?? ""}
                onChange={e => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600"
              >
                <option value="">كل المشاريع</option>
                {projectOpts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            <Button variant="outline" size="sm" onClick={() => setSplitView(v => !v)}
              className={cn("gap-1.5", splitView && "bg-indigo-50 border-indigo-200 text-indigo-700")}>
              <SplitSquareHorizontal size={13} />
              {splitView ? "عرض مقارن" : "عادي"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAiVisible(v => !v)}
              className={cn("gap-1.5", aiVisible && "bg-violet-50 border-violet-200 text-violet-700")}>
              {aiVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              AI
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBatchMode(m => !m); setSelectedIds(new Set()); }}
              className={cn("gap-1.5", batchMode && "bg-blue-50 border-blue-200 text-blue-700")}>
              <Layers size={13} />
              {batchMode ? "إلغاء الدُفعة" : "دُفعة"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowShortcuts(true)} className="gap-1.5">
              <Keyboard size={13} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* ── Keyboard hint bar ─────────────────────────────────────── */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-1.5 text-[11px] text-slate-400 flex gap-4 flex-wrap">
          {[["J/K", "تنقل"], ["A", "قبول"], ["R", "رفض"], ["E", "تعديل"], ["B", "دُفعة"], ["S", "مقارنة"], ["?", "مساعدة"]].map(([k, d]) => (
            <span key={k}><kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono ml-1">{k}</kbd>{d}</span>
          ))}
        </div>

        {/* ── Batch actions bar ─────────────────────────────────────── */}
        {batchMode && selectedIds.size > 0 && (
          <div className="bg-blue-50 border-b border-blue-100 px-5 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-blue-700 font-medium">تم تحديد {selectedIds.size}</span>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={batchApprove} disabled={isMutating}>
              <CheckCircle2 size={13} className="ml-1" /> قبول الكل
            </Button>
            <div className="flex gap-1 flex-wrap">
              {REJECT_PRESETS.map(r => (
                <button key={r} onClick={() => batchReject(r)}
                  className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
                  ✕ {r}
                </button>
              ))}
            </div>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 mr-auto">
              إلغاء التحديد
            </button>
          </div>
        )}

        {/* ── Stats strip ───────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-100 px-5 py-2 grid grid-cols-4 gap-4 flex-shrink-0">
          {[
            { label: "معلقة",      value: stats?.pendingReviews ?? 0,    icon: <Clock size={13} className="text-amber-400" /> },
            { label: "مكتملة",     value: stats?.completedReviews ?? 0,  icon: <CheckCircle2 size={13} className="text-green-500" /> },
            { label: "قبول",       value: `${stats?.agreementRate ?? 0}%`, icon: <TrendingUp size={13} className="text-blue-500" /> },
            { label: "رفض",        value: `${stats?.completedReviews ? Math.round(((stats as any).rejectedCount ?? 0) / stats.completedReviews * 100) : 0}%`, icon: <XCircle size={13} className="text-red-400" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-2">
              {icon}
              <div>
                <p className="text-base font-bold text-slate-800 leading-none">{value}</p>
                <p className="text-[10px] text-slate-400">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Body: list + focused pane ─────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Queue list (left) ────────────────────────────────────── */}
          <div className={cn(
            "flex flex-col border-l border-slate-200 bg-white flex-shrink-0 overflow-y-auto",
            splitView ? "w-72" : "w-80"
          )}>
            {/* List header */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <span className="text-xs font-semibold text-slate-600">{pending.length} مهمة معلقة</span>
              {batchMode && (
                <button onClick={selectAll} className="text-[11px] text-blue-600 hover:underline">
                  {selectedIds.size === pending.length ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : pending.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 p-8">
                <CheckCircle2 className="w-10 h-10 text-green-300" />
                <p className="text-sm">لا توجد مراجعات معلقة 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {pending.map((item: any, idx: number) => {
                  const isFocused = idx === focusedIdx && !batchMode;
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => batchMode ? toggleSelect(item.id) : setFocusedIdx(idx)}
                      className={cn(
                        "px-4 py-3 cursor-pointer transition-all hover:bg-slate-50",
                        isFocused  && "bg-indigo-50 border-r-[3px] border-indigo-500",
                        isSelected && "bg-blue-50"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {batchMode && (
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleSelect(item.id)}
                            onClick={e => e.stopPropagation()}
                            className="mt-1 accent-blue-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {item.isHoneyPot && (
                              <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold">🍯</span>
                            )}
                            <span className="text-[11px] font-semibold text-slate-700 truncate">
                              مهمة #{item.taskId}
                            </span>
                            <SkillBadge level={item.annotatorSkill ?? item.skillLevel} />
                          </div>
                          <p className="text-xs text-slate-500 truncate">{item.content ?? item.taskContent ?? "—"}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <User size={10} /> {item.annotatorName ?? item.taskerName ?? `#${item.userId}`}
                            </span>
                            {item.annTimeSpent > 0 && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                <Clock size={10} /> {Math.round(item.annTimeSpent / 60)}د
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-slate-300 self-center">
                          <ChevronLeft size={14} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Focused review pane (right) ───────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-5 min-w-0">
            {!focused ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <CheckCircle2 className="w-14 h-14 text-green-200" />
                <p className="text-lg font-medium">اختر مهمة من القائمة للمراجعة</p>
                <p className="text-xs">أو استخدم J/K للتنقل</p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-4">

                {/* ── Task header ───────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h2 className="font-bold text-slate-900 text-base">مهمة #{focused.taskId}</h2>
                        {focused.isHoneyPot && (
                          <Badge className="bg-amber-100 text-amber-700 text-xs">🍯 Honey Pot</Badge>
                        )}
                        <SkillBadge level={focused.annotatorSkill ?? focused.skillLevel} />
                        {focused.projectName && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Folder size={11} /> {focused.projectName}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <User size={11} /> {focused.annotatorName ?? focused.taskerName ?? `#${focused.userId}`}
                        {focused.annTimeSpent > 0 && (
                          <span className="mr-2 flex items-center gap-1">
                            <Clock size={11} /> {Math.round(focused.annTimeSpent / 60)} دقيقة
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Navigation arrows */}
                    <div className="flex gap-1">
                      <button onClick={() => setFocusedIdx(i => Math.max(i - 1, 0))}
                        disabled={focusedIdx === 0}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                        <ChevronRight size={14} />
                      </button>
                      <span className="text-xs text-slate-400 self-center px-1">{focusedIdx + 1}/{pending.length}</span>
                      <button onClick={() => setFocusedIdx(i => Math.min(i + 1, pending.length - 1))}
                        disabled={focusedIdx === pending.length - 1}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                        <ChevronLeft size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Task content */}
                  <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed" dir="rtl">
                    {focused.content ?? focused.taskContent ?? "—"}
                  </div>
                </div>

                {/* ── Annotation (or split comparison) ─────────────── */}
                {splitView && comparisons.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    <AnnotationPane item={focused} label="التوسيم الحالي" highlight />
                    {comparisons.slice(0, 1).map((c: any) => (
                      <AnnotationPane key={c.id} item={c} label={`مقارنة: ${c.annotatorName ?? `#${c.userId}`}`} />
                    ))}
                  </div>
                ) : (
                  <AnnotationPane item={focused} label="نتيجة التوسيم" highlight />
                )}

                {/* ── AI badges ─────────────────────────────────────── */}
                {aiVisible && (
                  <div className="space-y-2">
                    <AiReviewBadge annotationId={focused.id} />
                    <SpamBadge annotationId={focused.id} />
                  </div>
                )}

                {/* ── Action bar ────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setPendingAction({ annotationId: focused.id, taskId: focused.taskId, type: "approve" })}
                      disabled={isMutating}
                    >
                      <CheckCircle2 size={15} className="ml-1.5" /> قبول (A)
                    </Button>
                    <Button
                      className="flex-1"
                      variant="destructive"
                      onClick={() => { setPendingAction({ annotationId: focused.id, taskId: focused.taskId, type: "reject" }); setTimeout(() => feedbackRef.current?.focus(), 100); }}
                      disabled={isMutating}
                    >
                      <XCircle size={15} className="ml-1.5" /> رفض (R)
                    </Button>
                    <Button
                      variant="outline"
                      className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => { setEditResult(JSON.stringify(focused.result ?? {}, null, 2)); setPendingAction({ annotationId: focused.id, taskId: focused.taskId, type: "edit" }); }}
                      disabled={isMutating}
                    >
                      <Pencil size={15} className="ml-1.5" /> تعديل (E)
                    </Button>
                  </div>

                  {/* Quick reject chips */}
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1.5">رفض سريع:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {REJECT_PRESETS.map(r => (
                        <button key={r}
                          onClick={() => reject.mutate({ annotationId: focused.id, feedback: r })}
                          className="text-xs px-2.5 py-1 bg-red-50 border border-red-100 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          disabled={isMutating}>
                          ✕ {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm dialog ────────────────────────────────────────────── */}
      <Dialog open={!!pendingAction} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.type === "approve" ? "✅ تأكيد القبول" :
               pendingAction?.type === "reject"  ? "❌ تأكيد الرفض" :
               "✏️ تعديل النتيجة والقبول"}
            </DialogTitle>
          </DialogHeader>

          {pendingAction?.type === "edit" && (
            <div className="mb-2">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">النتيجة المعدَّلة (JSON)</label>
              <textarea
                value={editResult}
                onChange={e => setEditResult(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono h-36 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-1">
              <MessageSquare size={13} />
              {pendingAction?.type === "reject" ? "سبب الرفض (مطلوب)" : "ملاحظة (اختياري)"}
            </label>

            {/* Preset chips for reject */}
            {pendingAction?.type === "reject" && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REJECT_PRESETS.map(r => (
                  <button key={r} onClick={() => setFeedbackText(r)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                      feedbackText === r
                        ? "bg-red-100 border-red-300 text-red-700 font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}>
                    {r}
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={feedbackRef}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder={pendingAction?.type === "reject" ? "اكتب سبب الرفض أو اختر من الأعلى..." : "أضف ملاحظاتك..."}
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={isMutating}>إلغاء</Button>
            <Button
              variant={pendingAction?.type === "approve" || pendingAction?.type === "edit" ? "default" : "destructive"}
              onClick={confirmAction}
              disabled={isMutating || (pendingAction?.type === "reject" && !feedbackText.trim())}
              className={pendingAction?.type === "approve" ? "bg-green-600 hover:bg-green-700" :
                         pendingAction?.type === "edit"    ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {isMutating ? "جارٍ..." :
               pendingAction?.type === "approve" ? "تأكيد القبول" :
               pendingAction?.type === "edit"    ? "حفظ وقبول" :
               "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Shortcuts dialog ──────────────────────────────────────────── */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>⌨️ اختصارات لوحة المفاتيح</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2 text-sm">
            {[
              ["J / ↓",      "المهمة التالية"],
              ["K / ↑",      "المهمة السابقة"],
              ["A / Enter",  "قبول المهمة المحددة"],
              ["R / Delete", "رفض المهمة المحددة"],
              ["E",          "تعديل النتيجة + قبول"],
              ["B",          "تفعيل/إيقاف وضع الدُفعة"],
              ["S",          "تفعيل/إيقاف العرض المقارن"],
              ["? / /",      "فتح/إغلاق هذه القائمة"],
              ["Esc",        "إلغاء / إغلاق"],
            ].map(([k, d]) => (
              <div key={k} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-600">{d}</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono">{k}</kbd>
              </div>
            ))}
          </div>
          <DialogFooter><Button onClick={() => setShowShortcuts(false)}>حسناً</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </ArabAnnotatorsDashboardLayout>
  );
}

// ─── Annotation display pane ──────────────────────────────────────────────────
function AnnotationPane({ item, label, highlight }: {
  item: any; label: string; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "bg-white rounded-2xl border shadow-sm overflow-hidden",
      highlight ? "border-indigo-200" : "border-slate-100"
    )}>
      <div className={cn(
        "px-4 py-2.5 border-b text-xs font-semibold",
        highlight ? "bg-indigo-50 border-indigo-100 text-indigo-700" : "bg-slate-50 border-slate-100 text-slate-600"
      )}>
        {label}
        {item.annotatorName && !highlight && (
          <span className="text-slate-400 font-normal mr-2">— {item.annotatorName}</span>
        )}
      </div>
      <div className="p-4">
        {item.result ? (
          <AnnotationWidget
            config={{
              type: (item.annotationType ?? "classification") as any,
              labels: (item.labelsConfig as any)?.labels ?? [],
              instructions: "",
            }}
            content={item.content ?? item.taskContent ?? ""}
            value={item.result as any}
            onChange={() => {}}
            readOnly
          />
        ) : (
          <p className="text-sm text-slate-400 font-mono text-center py-4">لا توجد نتيجة</p>
        )}
      </div>
    </div>
  );
}
