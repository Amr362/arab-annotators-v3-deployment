/**
 * QADashboard — v4 (Fixed)
 * ─────────────────────────
 * Full redesign of the QA review interface with proper tRPC integration.
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
 *   - Uses manager.qaApprove / manager.qaReject with correct payloads
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface QAItem {
  taskId: number;
  content: string;
  isHoneyPot?: boolean;
  taskStatus?: string;
  annId: number;
  annResult: any;
  annUserId: number;
  annTimeSpent?: number | null;
  aiSuggestion?: any;
  annotatorName?: string;
  annotatorSkill?: number;
  projectId?: number;
}

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
  // Get all projects first to determine available projects
  const { data: allProjects = [] } = trpc.projects.getAll.useQuery();
  
  // Get QA queue from manager router with project filter
  const { data: qaQueueData = { items: [], total: 0 }, isLoading, refetch } = trpc.manager.getQAQueue.useQuery(
    { projectId: projectFilter ?? (allProjects[0]?.id ?? 0), limit: 100, offset: 0 },
    { enabled: projectFilter !== null || allProjects.length > 0, refetchInterval: 30_000 }
  );

  const qaQueue = qaQueueData.items || [];

  // ── Filtered queue ─────────────────────────────────────────────────────────
  const pending = useMemo(() => {
    return (qaQueue as QAItem[]).filter(i => i.taskStatus === "IN_QA" || i.taskStatus === "submitted");
  }, [qaQueue]);

  const focused = pending[focusedIdx] ?? null;

  // Multi-annotator comparison: find other annotations for same task
  const { data: allForTask } = trpc.manager.getQAQueue.useQuery(
    { projectId: focused?.projectId ?? 0, limit: 100, offset: 0 },
    {
      enabled: splitView && !!focused?.taskId && focused.projectId !== undefined,
      select: (data: any) =>
        data.items?.filter((i: QAItem) => i.taskId === focused?.taskId && i.annId !== focused?.annId) ?? [],
    }
  );
  const comparisons = (allForTask as QAItem[] | undefined) ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const approve = trpc.manager.qaApprove.useMutation({
    onSuccess: () => {
      toast.success("✅ تم القبول");
      setSessionApproved(n => n + 1);
      setPendingAction(null);
      setFeedbackText("");
      advanceFocus();
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "حدث خطأ"),
  });

  const reject = trpc.manager.qaReject.useMutation({
    onSuccess: () => {
      toast.success("❌ تم الرفض");
      setSessionRejected(n => n + 1);
      setPendingAction(null);
      setFeedbackText("");
      advanceFocus();
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "حدث خطأ"),
  });

  const editAndApprove = trpc.manager.qaEditAndApprove.useMutation({
    onSuccess: () => {
      toast.success("✅ تم التعديل والقبول");
      setSessionApproved(n => n + 1);
      setPendingAction(null);
      setFeedbackText("");
      setEditResult("");
      advanceFocus();
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "حدث خطأ"),
  });

  const isMutating = approve.isPending || reject.isPending || editAndApprove.isPending;

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
        if (focused) { e.preventDefault(); setPendingAction({ annotationId: focused.annId, taskId: focused.taskId, type: "approve" }); }
        break;
      case "r": case "Delete":
        if (focused) { e.preventDefault(); setPendingAction({ annotationId: focused.annId, taskId: focused.taskId, type: "reject" }); setTimeout(() => feedbackRef.current?.focus(), 100); }
        break;
      case "e":
        if (focused) { e.preventDefault(); setEditResult(JSON.stringify(focused.annResult, null, 2)); setPendingAction({ annotationId: focused.annId, taskId: focused.taskId, type: "edit" }); }
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
    setSelectedIds(selectedIds.size === pending.length ? new Set() : new Set(pending.map((i: QAItem) => i.annId)));
  }
  async function batchApprove() {
    let done = 0;
    for (const id of selectedIds) {
      const item = pending.find((i: QAItem) => i.annId === id);
      if (item) {
        try { await approve.mutateAsync({ annotationId: id, taskId: item.taskId }); done++; } catch {}
      }
    }
    toast.success(`✅ تم قبول ${done} توسيم`);
    setSelectedIds(new Set());
    setBatchMode(false);
  }
  async function batchReject(reason: string) {
    let done = 0;
    for (const id of selectedIds) {
      const item = pending.find((i: QAItem) => i.annId === id);
      if (item) {
        try { await reject.mutateAsync({ annotationId: id, taskId: item.taskId, feedback: reason }); done++; } catch {}
      }
    }
    toast.success(`❌ تم رفض ${done} توسيم`);
    setSelectedIds(new Set());
    setBatchMode(false);
  }

  async function confirmAction() {
    if (!pendingAction || !focused) return;
    const { annotationId, type } = pendingAction;
    
    try {
      if (type === "approve") {
        await approve.mutateAsync({ annotationId, taskId: focused.taskId, feedback: feedbackText || undefined });
      } else if (type === "reject") {
        await reject.mutateAsync({ annotationId, taskId: focused.taskId, feedback: feedbackText || "مرفوض" });
      } else if (type === "edit") {
        const parsed = JSON.parse(editResult);
        await editAndApprove.mutateAsync({
          taskId: focused.taskId,
          annotationId,
          correctedResult: parsed,
          feedback: feedbackText || "تم التعديل",
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ");
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

  const queueTotal  = qaQueue.length;
  const drainPct    = queueTotal > 0 ? Math.round(((queueTotal - pending.length) / queueTotal) * 100) : 100;
  const projectOpts = allProjects.filter(p =>
    qaQueue.some((i: QAItem) => i.projectId === p.id)
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
                className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white"
              >
                <option value="">جميع المشاريع</option>
                {projectOpts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {/* Batch mode toggle */}
            <Button
              size="sm"
              variant={batchMode ? "default" : "outline"}
              onClick={() => setBatchMode(!batchMode)}
              className="text-xs"
            >
              <Layers size={12} className="ml-1" /> دُفعة (B)
            </Button>

            {/* Split view toggle */}
            <Button
              size="sm"
              variant={splitView ? "default" : "outline"}
              onClick={() => setSplitView(!splitView)}
              className="text-xs"
            >
              <SplitSquareHorizontal size={12} className="ml-1" /> مقارنة (S)
            </Button>

            {/* AI visibility toggle */}
            <Button
              size="sm"
              variant={aiVisible ? "default" : "outline"}
              onClick={() => setAiVisible(!aiVisible)}
              className="text-xs"
            >
              {aiVisible ? <Eye size={12} /> : <EyeOff size={12} />} AI
            </Button>

            {/* Shortcuts */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowShortcuts(true)}
              className="text-xs"
            >
              <Keyboard size={12} className="ml-1" /> ⌨️
            </Button>

            {/* Refresh */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              className="text-xs"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex gap-4 p-4">
          {/* ── Queue list (left pane) ────────────────────────────── */}
          <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600">
                {batchMode ? "وضع الدُفعة" : "قائمة الانتظار"}
              </p>
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-slate-400">جاري التحميل...</p>
              </div>
            ) : pending.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-slate-400">لا توجد مهام معلقة</p>
              </div>
            ) : (
              <>
                {batchMode && (
                  <div className="px-3 py-2 border-b border-slate-100 bg-blue-50 space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={selectAll}
                      className="w-full text-xs"
                    >
                      {selectedIds.size === pending.length ? "إلغاء التحديد" : "تحديد الكل"}
                    </Button>
                    {selectedIds.size > 0 && (
                      <>
                        <Button
                          size="sm"
                          className="w-full text-xs bg-green-600 hover:bg-green-700"
                          onClick={batchApprove}
                          disabled={isMutating}
                        >
                          قبول {selectedIds.size}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full text-xs"
                          onClick={() => batchReject("مرفوض")}
                          disabled={isMutating}
                        >
                          رفض {selectedIds.size}
                        </Button>
                      </>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {pending.map((item: QAItem, idx: number) => (
                    <div
                      key={item.annId}
                      onClick={() => {
                        if (batchMode) toggleSelect(item.annId);
                        else setFocusedIdx(idx);
                      }}
                      className={cn(
                        "px-3 py-2.5 border-b border-slate-50 cursor-pointer transition-colors",
                        focusedIdx === idx && !batchMode ? "bg-indigo-50 border-indigo-200" : "hover:bg-slate-50",
                        batchMode && selectedIds.has(item.annId) ? "bg-blue-100" : ""
                      )}
                    >
                      {batchMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.annId)}
                          onChange={() => toggleSelect(item.annId)}
                          className="mr-2"
                        />
                      )}
                      <p className="text-xs font-semibold text-slate-900 line-clamp-2">
                        {item.content ?? "—"}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                        <User size={9} /> {item.annotatorName ?? `#${item.annUserId}`}
                        {item.isHoneyPot && <Badge className="text-[8px] px-1 py-0 ml-1">🍯 Honey Pot</Badge>}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Review pane (right pane) ──────────────────────────── */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {focused ? (
              <>
                {/* Header */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">المهمة #{focused.taskId}</h2>
                      <div className="flex items-center gap-2 mt-1.5">
                        {focused.isHoneyPot && <Badge className="text-xs">🍯 Honey Pot</Badge>}
                        <SkillBadge level={focused.annotatorSkill} />
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <User size={11} /> {focused.annotatorName ?? `#${focused.annUserId}`}
                        {focused.annTimeSpent && focused.annTimeSpent > 0 && (
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
                    {focused.content ?? "—"}
                  </div>
                </div>

                {/* ── Annotation (or split comparison) ─────────────── */}
                {splitView && comparisons.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    <AnnotationPane item={focused} label="التوسيم الحالي" highlight />
                    {comparisons.slice(0, 1).map((c: QAItem) => (
                      <AnnotationPane key={c.annId} item={c} label={`مقارنة: ${c.annotatorName ?? `#${c.annUserId}`}`} />
                    ))}
                  </div>
                ) : (
                  <AnnotationPane item={focused} label="نتيجة التوسيم" highlight />
                )}

                {/* ── AI badges ─────────────────────────────────────── */}
                {aiVisible && (
                  <div className="space-y-2">
                    <AiReviewBadge annotationId={focused.annId} />
                    <SpamBadge annotationId={focused.annId} />
                  </div>
                )}

                {/* ── Action bar ────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setPendingAction({ annotationId: focused.annId, taskId: focused.taskId, type: "approve" })}
                      disabled={isMutating}
                    >
                      <CheckCircle2 size={15} className="ml-1.5" /> قبول (A)
                    </Button>
                    <Button
                      className="flex-1"
                      variant="destructive"
                      onClick={() => { setPendingAction({ annotationId: focused.annId, taskId: focused.taskId, type: "reject" }); setTimeout(() => feedbackRef.current?.focus(), 100); }}
                      disabled={isMutating}
                    >
                      <XCircle size={15} className="ml-1.5" /> رفض (R)
                    </Button>
                    <Button
                      variant="outline"
                      className="border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => { setEditResult(JSON.stringify(focused.annResult ?? {}, null, 2)); setPendingAction({ annotationId: focused.annId, taskId: focused.taskId, type: "edit" }); }}
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
                          onClick={() => reject.mutate({ annotationId: focused.annId, taskId: focused.taskId, feedback: r })}
                          className="text-xs px-2.5 py-1 bg-red-50 border border-red-100 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          disabled={isMutating}>
                          ✕ {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-slate-400">لا توجد مهام لمراجعتها</p>
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
  item: QAItem; label: string; highlight?: boolean;
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
        {item.annResult ? (
          <AnnotationWidget
            text={item.content ?? ""}
            config={{
              type: "classification" as const,
              labels: [],
              instructions: "",
            }}
            value={item.annResult as any}
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
