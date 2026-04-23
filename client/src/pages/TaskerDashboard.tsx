// NEW PREMIUM TASKER DASHBOARD — rebuilt from scratch
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, Clock, Zap, MessageSquare, Search,
  Timer, SkipForward, Save, Keyboard, BookOpen, ChevronRight,
  ChevronLeft, Trophy, Star, LayoutList, Flame, Target, Coins,
  ThumbsUp, ThumbsDown, Sparkles, Brain, Layers, ArrowRight,
  Check, X, RefreshCw, Lightbulb, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import AnnotationWidget from "@/components/annotation/AnnotationWidget";
import type { AnnotationResult, ProjectLabelConfig } from "@/components/annotation/types";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  pending: "جديدة", in_progress: "قيد العمل", submitted: "مُسلَّمة",
  approved: "مقبولة", rejected: "مرفوضة",
};
const statusColor: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400"   },
  in_progress: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  submitted:   { bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-500"     },
  approved:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected:    { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
};

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) ref.current = setInterval(() => setSeconds(s => s + 1), 1000);
    else if (ref.current) clearInterval(ref.current);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);
  const reset = useCallback(() => setSeconds(0), []);
  const fmt = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  const color = seconds > 120 ? "text-red-400" : seconds > 60 ? "text-amber-400" : "text-emerald-400";
  return { seconds, fmt, reset, color };
}

function useAutoSave(taskId: number | null, result: AnnotationResult | null) {
  const saveDraft = trpc.draft.save.useMutation();
  const lastSaved = useRef<string>("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!taskId || !result) return;
    const s = JSON.stringify(result);
    if (s === lastSaved.current) return;
    const t = setTimeout(async () => {
      try { await saveDraft.mutateAsync({ taskId, result }); lastSaved.current = s; setSavedAt(new Date()); } catch {}
    }, 2000);
    return () => clearTimeout(t);
  }, [taskId, result]);
  return { isSaving: saveDraft.isPending, savedAt };
}

const DEFAULT_CONFIG: ProjectLabelConfig = {
  type: "classification",
  labels: [
    { value: "إيجابي", color: "#10B981", shortcut: "1" },
    { value: "سلبي",   color: "#EF4444", shortcut: "2" },
    { value: "محايد",  color: "#94A3B8", shortcut: "3" },
  ],
};

const LEVELS = [
  { name: "مبتدئ",  min: 0,    icon: "🌱", color: "#94A3B8" },
  { name: "متقدم",  min: 50,   icon: "⚡", color: "#F59E0B" },
  { name: "محترف",  min: 150,  icon: "🔥", color: "#F97316" },
  { name: "خبير",   min: 400,  icon: "💎", color: "#8B5CF6" },
  { name: "أسطورة", min: 1000, icon: "👑", color: "#EAB308" },
];
function getLevel(pts: number) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (pts >= l.min) lv = l;
  const nx = LEVELS[LEVELS.indexOf(lv) + 1];
  const pct = nx ? ((pts - lv.min) / (nx.min - lv.min)) * 100 : 100;
  return { ...lv, next: nx, pct };
}

const TASK_TYPE_LABEL: Record<string, string> = {
  classification: "تصنيف نصي", multi_classification: "تصنيف متعدد",
  ner: "تحديد كيانات", pairwise: "مقارنة نصين", relations: "علاقات",
};

export default function TaskerDashboard() {
  const { user } = useAuth();

  const [panel, setPanel] = useState<"annotate"|"tasks"|"feedback">("annotate");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [annotationResult, setAnnotationResult] = useState<AnnotationResult | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [points, setPoints] = useState(0);
  const [streak] = useState(3);
  const [showSuccess, setShowSuccess] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState<number | null>(null);

  const timer = useTimer(true);
  const { data: tasks, isLoading, refetch } = trpc.tasker.getTasks.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.tasker.getStats.useQuery();
  const { data: feedback } = trpc.tasker.getFeedback.useQuery();

  const pendingTasks = (tasks ?? []).filter(t => t.status === "pending" || t.status === "in_progress");
  const currentTask = pendingTasks[currentIdx] ?? null;

  const { data: projectData } = trpc.projectConfig.get.useQuery(
    { projectId: currentTask?.projectId ?? 0 }, { enabled: !!currentTask }
  );

  const labelConfig: ProjectLabelConfig = (() => {
    if (!projectData?.labelsConfig) return DEFAULT_CONFIG;
    const cfg = projectData.labelsConfig as any;
    return {
      type: (projectData.annotationType as any) ?? "classification",
      labels: cfg.labels ?? [],
      instructions: projectData.instructions ?? cfg.instructions,
      minAnnotations: projectData.minAnnotations ?? 1,
      aiPreAnnotation: projectData.aiPreAnnotation ?? false,
    };
  })();

  const { data: draftData } = trpc.draft.get.useQuery(
    { taskId: currentTask?.id ?? 0 }, { enabled: !!currentTask }
  );
  useEffect(() => {
    if (draftData?.result && !annotationResult) setAnnotationResult(draftData.result as AnnotationResult);
  }, [draftData]);
  useEffect(() => { setAnnotationResult(null); timer.reset(); }, [currentTask?.id]);

  const { data: aiSuggestion } = trpc.aiAnnotation.suggest.useQuery(
    { taskId: currentTask?.id ?? 0, projectId: currentTask?.projectId ?? 0 },
    { enabled: !!currentTask && !!labelConfig.aiPreAnnotation }
  );

  const { isSaving, savedAt } = useAutoSave(currentTask?.id ?? null, annotationResult);

  const submitAnnotation = trpc.tasker.submitAnnotation.useMutation({
    onSuccess: () => {
      const earned = Math.max(5, 30 - Math.floor(timer.seconds / 10));
      setPoints(p => p + earned);
      setEarnedPoints(earned);
      setShowSuccess(true);
      setTimeout(() => { setShowSuccess(false); setEarnedPoints(null); }, 2000);
      toast.success(`✅ تم التسليم بنجاح! +${earned} نقطة`);
      setAnnotationResult(null); timer.reset();
      refetch(); refetchStats();
      setCurrentIdx(i => Math.max(0, Math.min(i, pendingTasks.length - 2)));
    },
    onError: e => toast.error(e.message),
  });

  const skipTask = trpc.taskSkip.skip.useMutation({
    onSuccess: () => {
      toast("⏭️ تم تخطي المهمة");
      setShowSkipModal(false); setSkipReason("");
      setAnnotationResult(null); timer.reset();
      refetch(); refetchStats();
      setCurrentIdx(i => Math.max(0, Math.min(i, pendingTasks.length - 2)));
    },
    onError: e => toast.error(e.message),
  });

  async function handleSubmit() {
    if (!currentTask || !annotationResult) return;
    const isEmpty =
      (annotationResult.labels !== undefined && annotationResult.labels.length === 0) ||
      (!annotationResult.labels && !annotationResult.spans?.length && !annotationResult.choice && !annotationResult.entities?.length);
    if (isEmpty) { toast.error("يرجى إكمال التوسيم أولاً"); return; }
    await submitAnnotation.mutateAsync({ taskId: currentTask.id, result: { ...annotationResult, timeSpentSeconds: timer.seconds } });
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "?" || e.key === "/") { e.preventDefault(); setShowShortcuts(s => !s); }
    else if (e.key === "Escape") { setShowShortcuts(false); setShowSkipModal(false); }
    else if (e.key === "Enter" && !e.shiftKey && currentTask && panel === "annotate") { e.preventDefault(); handleSubmit(); }
    else if ((e.key === "s" || e.key === "S") && currentTask && panel === "annotate") { e.preventDefault(); setShowSkipModal(true); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setCurrentIdx(i => Math.max(0, i - 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setCurrentIdx(i => Math.min(pendingTasks.length - 1, i + 1)); }
  }, [currentTask, pendingTasks.length, annotationResult, panel]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!user || (user.role !== "tasker" && user.role !== "admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F6FA]">
        <div className="text-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-lg font-bold text-slate-800">غير مصرح</p>
        </div>
      </div>
    );
  }

  const filteredTasks = (tasks ?? []).filter(t => {
    const ms = !search || t.content.toLowerCase().includes(search.toLowerCase());
    const mf = statusFilter === "all" || t.status === statusFilter;
    return ms && mf;
  });

  const rejectedCount = feedback?.filter((f: any) => f.status === "rejected").length ?? 0;
  const completionPct = stats?.totalCount ? ((stats.completedCount ?? 0) / stats.totalCount) * 100 : 0;
  const totalPts = points + (stats?.totalCompleted ?? 0) * 10;
  const level = getLevel(totalPts);

  return (
    <div className="flex h-screen bg-[#F4F6FA] overflow-hidden" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', 'Noto Sans Arabic', system-ui, sans-serif" }}>

      {/* ── SUCCESS ANIMATION ── */}
      {showSuccess && (
        <div className="fixed inset-0 pointer-events-none z-[60] flex items-center justify-center">
          <div className="bg-emerald-500 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-3 text-xl font-bold"
            style={{ animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <Check className="w-7 h-7" />
            أحسنت! {earnedPoints && <span className="text-emerald-100 text-base">+{earnedPoints} نقطة</span>}
          </div>
        </div>
      )}

      {/* ════════ LEFT SIDEBAR ════════ */}
      <aside className={cn(
        "flex flex-col bg-[#0D1117] border-l border-white/[0.06] transition-all duration-300 flex-shrink-0",
        sidebarOpen ? "w-[260px]" : "w-[60px]"
      )}>
        {/* Logo row */}
        <div className="px-4 py-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#00D4A8] to-[#0EA5E9] rounded-xl flex items-center justify-center font-black text-[#0D1117] text-sm flex-shrink-0 shadow-[0_0_20px_rgba(0,212,168,0.3)]">
            AA
          </div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm">Arab Annotators</p>
              <p className="text-white/30 text-[11px]">منصة التوسيم الاحترافية</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(s => !s)} className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mr-auto">
            {sidebarOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* User card */}
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <div className={cn("flex items-center gap-2.5", !sidebarOpen && "justify-center")}>
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-lg">
                {user.name?.[0] ?? "م"}
              </div>
              <span className="absolute -bottom-1 -left-1 text-xs leading-none">{level.icon}</span>
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate leading-tight">{user.name}</p>
                <p className="text-white/30 text-[11px]">{level.name}</p>
                <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${level.pct}%`, backgroundColor: level.color }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="p-2 space-y-0.5 flex-1">
          {([
            { id: "annotate", label: "التوسيم",      icon: Brain,      badge: pendingTasks.length || null },
            { id: "tasks",    label: "المهام",        icon: LayoutList, badge: null },
            { id: "feedback", label: "الملاحظات",    icon: MessageSquare, badge: rejectedCount || null },
          ] as const).map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setPanel(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all",
                panel === id ? "bg-white/10 text-white" : "text-white/35 hover:text-white/70 hover:bg-white/5",
                !sidebarOpen && "justify-center px-2"
              )}>
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && <>
                <span className="flex-1 text-right">{label}</span>
                {badge ? <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span> : null}
              </>}
            </button>
          ))}
        </nav>

        {/* Bottom stats */}
        {sidebarOpen && (
          <div className="p-3 border-t border-white/[0.06] space-y-2">
            {/* Streak */}
            <div className="bg-white/[0.04] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-[11px]">سلسلة الأيام</span>
                <Flame size={13} className="text-orange-400" />
              </div>
              <div className="flex gap-1 mb-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className={cn("flex-1 rounded-sm",
                    i < streak ? "bg-orange-400" : "bg-white/10",
                    i === streak - 1 ? "h-5" : i === streak - 2 ? "h-3.5" : "h-2.5"
                  )} />
                ))}
              </div>
              <p className="text-white text-[11px] font-semibold">{streak} أيام متتالية 🔥</p>
            </div>
            {/* Points + Earnings */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.04] rounded-xl p-2.5">
                <p className="text-white/30 text-[10px]">النقاط</p>
                <p className="text-amber-400 font-black text-base tabular-nums">{totalPts.toLocaleString("ar")}</p>
              </div>
              <div className="bg-emerald-900/30 border border-emerald-500/10 rounded-xl p-2.5">
                <p className="text-white/30 text-[10px]">الأرباح</p>
                <p className="text-emerald-400 font-black text-base">{((stats?.completedToday ?? 0) * 0.15).toFixed(2)}$</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ════════ MAIN CONTENT ════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">الموسِّم</span>
            <span className="text-slate-200">/</span>
            <span className="text-slate-700 font-semibold">
              {panel === "annotate" ? "التوسيم" : panel === "tasks" ? "قائمة المهام" : "ملاحظات الجودة"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex-1 max-w-sm mx-auto flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-l from-amber-500 to-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${completionPct}%` }} />
            </div>
            <span className="text-xs text-slate-400 font-mono whitespace-nowrap tabular-nums">
              {stats?.completedCount ?? 0}<span className="text-slate-200">/</span>{stats?.totalCount ?? 0}
            </span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 mr-auto">
            {isSaving && <span className="text-xs text-slate-400 flex items-center gap-1 animate-pulse"><RefreshCw size={11} className="animate-spin" />حفظ...</span>}
            {savedAt && !isSaving && <span className="text-xs text-slate-300 flex items-center gap-1"><Check size={11} className="text-emerald-400" />محفوظ</span>}
            <button onClick={() => setShowShortcuts(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-all border border-slate-200">
              <Keyboard size={13} /><span>مساعدة</span><kbd className="text-[9px] bg-white border border-slate-200 px-1 rounded font-mono">?</kbd>
            </button>
          </div>
        </header>

        {/* Stats strip */}
        <div className="bg-white/60 backdrop-blur-sm border-b border-slate-100 px-6 py-2.5 flex items-center gap-3 flex-shrink-0">
          {([
            { label: "متبقية",        v: stats?.pendingCount ?? 0,   icon: Clock,        c: "bg-sky-50 text-sky-500" },
            { label: "مكتملة اليوم",  v: stats?.completedToday ?? 0, icon: CheckCircle2, c: "bg-emerald-50 text-emerald-500" },
            { label: "الدقة",         v: `${stats?.accuracy ?? 0}%`, icon: Target,       c: "bg-violet-50 text-violet-500" },
            { label: "الإجمالي",      v: stats?.totalCompleted ?? 0, icon: Trophy,       c: "bg-amber-50 text-amber-500" },
          ] as const).map(({ label, v, icon: Icon, c }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-100 shadow-sm">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0", c)}>
                <Icon size={13} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 leading-none">{label}</p>
                <p className="text-sm font-bold text-slate-800 tabular-nums leading-tight">{v}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">

          {/* ═══ ANNOTATE ═══ */}
          {panel === "annotate" && (
            <>
              <div className="flex-1 overflow-auto p-5 space-y-4">
                {pendingTasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center max-w-xs">
                      <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">أنجزت كل المهام! 🎉</h3>
                      <p className="text-slate-400 text-sm mb-5">لا توجد مهام معلقة حالياً</p>
                      <button onClick={() => refetch()} className="flex items-center gap-2 mx-auto text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:shadow transition-all">
                        <RefreshCw size={14} /> تحديث
                      </button>
                    </div>
                  </div>
                ) : (<>

                  {/* Task nav bar */}
                  <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
                          className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center disabled:opacity-30 transition-all">
                          <ChevronRight size={14} />
                        </button>
                        <span className="px-2 text-sm font-bold text-slate-700 tabular-nums">
                          {currentIdx + 1}<span className="text-slate-300 font-normal"> / </span>{pendingTasks.length}
                        </span>
                        <button onClick={() => setCurrentIdx(i => Math.min(pendingTasks.length - 1, i + 1))} disabled={currentIdx === pendingTasks.length - 1}
                          className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center disabled:opacity-30 transition-all">
                          <ChevronLeft size={14} />
                        </button>
                      </div>
                      <div className="w-px h-4 bg-slate-200" />
                      <span className="text-[11px] text-slate-400 font-mono">#{currentTask?.id}</span>
                      {currentTask?.isGroundTruth && (
                        <span className="flex items-center gap-1 text-[11px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-semibold border border-amber-200">
                          <Star size={9} fill="currentColor" /> اختبار
                        </span>
                      )}
                      {currentTask?.status && (
                        <span className={cn("flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium",
                          statusColor[currentTask.status]?.bg, statusColor[currentTask.status]?.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", statusColor[currentTask.status]?.dot)} />
                          {statusLabel[currentTask.status]}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-300 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                        {TASK_TYPE_LABEL[labelConfig.type] ?? labelConfig.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn("flex items-center gap-1.5 text-[13px] font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors", timer.color)}>
                        <Timer size={12} />{timer.fmt}
                      </div>
                      <button onClick={() => setShowSkipModal(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all">
                        <SkipForward size={13} />تخطي<kbd className="text-[9px] bg-white border border-slate-100 px-1 rounded font-mono">S</kbd>
                      </button>
                    </div>
                  </div>

                  {/* Instructions */}
                  {labelConfig.instructions && (
                    <div className="bg-sky-50 border border-sky-100 rounded-2xl overflow-hidden">
                      <button onClick={() => setShowInstructions(s => !s)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-sky-100/50 transition-colors">
                        <span className="flex items-center gap-2 text-sky-700 text-sm font-semibold">
                          <Lightbulb size={13} className="text-sky-500" />تعليمات المهمة
                        </span>
                        {showInstructions ? <ChevronUp size={13} className="text-sky-400" /> : <ChevronDown size={13} className="text-sky-400" />}
                      </button>
                      {showInstructions && (
                        <div className="px-4 pb-3 text-sm text-sky-800 leading-relaxed border-t border-sky-100 pt-2.5" dir="rtl">
                          {labelConfig.instructions}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Annotation card */}
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-50 bg-gradient-to-l from-slate-50 to-white flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                        <Layers size={11} />منطقة التوسيم
                      </span>
                      {aiSuggestion && labelConfig.aiPreAnnotation && (
                        <span className="flex items-center gap-1.5 text-[11px] text-violet-600 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                          <Brain size={10} />اقتراح AI متاح
                        </span>
                      )}
                    </div>
                    <div className="p-5">
                      {currentTask && projectData?.annotationType === "html_interface" ? (
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                          <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                            واجهة تفاعلية مخصصة
                          </div>
                          <iframe
                            srcDoc={projectData.instructions ?? ""}
                            className="w-full border-0"
                            style={{ minHeight: "360px" }}
                            sandbox="allow-scripts allow-same-origin"
                            title="task-interface"
                            onLoad={(e) => {
                              // Listen for postMessage result from the interface
                              const handler = (ev: MessageEvent) => {
                                if (ev.data?.type === "annotation_result") {
                                  setAnnotationResult(ev.data.result);
                                }
                              };
                              window.addEventListener("message", handler);
                              return () => window.removeEventListener("message", handler);
                            }}
                          />
                          {currentTask.content && (
                            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-sm text-slate-600 text-right" dir="rtl">
                              {currentTask.content}
                            </div>
                          )}
                        </div>
                      ) : currentTask ? (
                        <AnnotationWidget
                          text={currentTask.content}
                          config={labelConfig}
                          value={annotationResult}
                          onChange={setAnnotationResult}
                          aiSuggestion={aiSuggestion as AnnotationResult | null}
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Submit button */}
                  <button onClick={handleSubmit}
                    disabled={!annotationResult || submitAnnotation.isPending}
                    className="w-full py-3.5 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all duration-200 bg-gradient-to-l from-amber-500 to-amber-400 text-white shadow-sm hover:from-amber-600 hover:to-amber-500 hover:shadow-lg hover:shadow-amber-200/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none">
                    {submitAnnotation.isPending
                      ? <><RefreshCw size={16} className="animate-spin" />جارٍ الإرسال...</>
                      : <><Check size={17} />تسليم التوسيم<kbd className="text-[10px] bg-white/20 px-2 py-0.5 rounded-lg font-mono border border-white/10">Enter</kbd></>
                    }
                  </button>

                  {/* Progress dots */}
                  {pendingTasks.length > 1 && pendingTasks.length <= 24 && (
                    <div className="flex justify-center gap-1.5">
                      {pendingTasks.map((_, i) => (
                        <button key={i} onClick={() => setCurrentIdx(i)}
                          className={cn("rounded-full transition-all duration-200",
                            i === currentIdx ? "w-5 h-2 bg-amber-500" : "w-2 h-2 bg-slate-200 hover:bg-slate-400")} />
                      ))}
                    </div>
                  )}
                </>)}
              </div>

              {/* Right tools panel */}
              <aside className={cn(
                "bg-white border-r border-slate-100 flex-shrink-0 transition-all duration-300 flex flex-col overflow-hidden",
                rightOpen ? "w-64" : "w-10"
              )}>
                <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
                  {rightOpen && <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">الأدوات</span>}
                  <button onClick={() => setRightOpen(s => !s)} className="text-slate-300 hover:text-slate-600 transition-colors mr-auto">
                    {rightOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                  </button>
                </div>
                {rightOpen && (
                  <div className="flex-1 overflow-auto p-3 space-y-4">
                    {/* Labels */}
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">التصنيفات</p>
                      <div className="space-y-1">
                        {labelConfig.labels.map(l => (
                          <div key={l.value} className="flex items-center gap-2 bg-slate-50 rounded-xl px-2.5 py-2 border border-slate-100">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                            <span className="text-[13px] text-slate-700 flex-1">{l.value}</span>
                            {l.shortcut && (
                              <kbd className="text-[10px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono">{l.shortcut}</kbd>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shortcuts */}
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">اختصارات</p>
                      <div className="space-y-1.5">
                        {[
                          { key: "Enter", d: "تسليم" }, { key: "S", d: "تخطي" },
                          { key: "→/←", d: "التنقل" }, { key: "?", d: "مساعدة" },
                        ].map(s => (
                          <div key={s.key} className="flex items-center justify-between text-[12px] text-slate-500">
                            <span>{s.d}</span>
                            <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600 text-[10px]">{s.key}</kbd>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Difficulty */}
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">الصعوبة التقديرية</p>
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <div className="flex gap-1 mb-1">
                          {[1,2,3,4,5].map(n => (
                            <div key={n} className={cn("flex-1 h-2 rounded-full", n <= 2 ? "bg-emerald-400" : n === 3 ? "bg-amber-400" : "bg-slate-200")} />
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 text-center mt-1">متوسط</p>
                      </div>
                    </div>

                    {/* AI */}
                    {labelConfig.aiPreAnnotation && (
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Brain size={12} className="text-violet-500" />
                          <span className="text-[11px] font-semibold text-violet-700">اقتراح الذكاء الاصطناعي</span>
                        </div>
                        <p className="text-[11px] text-violet-500">{aiSuggestion ? "متاح في منطقة التوسيم" : "يحلل النص..."}</p>
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </>
          )}

          {/* ═══ TASKS LIST ═══ */}
          {panel === "tasks" && (
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="flex gap-3 flex-wrap items-center bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
                    className="w-full pr-8 pl-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400" />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {["all","pending","submitted","approved","rejected"].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={cn("px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                        statusFilter === s ? "bg-amber-500 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200")}>
                      {s === "all" ? "الكل" : statusLabel[s]}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 mr-auto">{filteredTasks.length} مهمة</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {isLoading ? (
                  <div className="p-12 text-center"><div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                ) : filteredTasks.length ? (
                  <div>
                    <div className="grid grid-cols-[40px_1fr_100px_80px] gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      <span>#</span><span>المحتوى</span><span>الحالة</span><span></span>
                    </div>
                    {filteredTasks.map((task, i) => {
                      const canAnnotate = task.status === "pending" || task.status === "in_progress";
                      const pendingIdx = pendingTasks.findIndex(t => t.id === task.id);
                      const sc = statusColor[task.status];
                      return (
                        <div key={task.id} className="grid grid-cols-[40px_1fr_100px_80px] gap-3 items-center px-5 py-3 hover:bg-slate-50/80 transition-colors border-b border-slate-50 last:border-0 group">
                          <span className="text-[11px] text-slate-300 font-mono text-center">{i+1}</span>
                          <p className="text-sm text-slate-700 line-clamp-1" dir="rtl">
                            {task.isGroundTruth && <Star size={9} className="inline text-amber-400 fill-amber-400 ml-1 mb-0.5" />}
                            {task.content}
                          </p>
                          <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium w-fit", sc?.bg, sc?.text)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", sc?.dot)} />
                            {statusLabel[task.status]}
                          </span>
                          {canAnnotate ? (
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-all text-[11px] font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
                              onClick={() => { if (pendingIdx !== -1) { setCurrentIdx(pendingIdx); setPanel("annotate"); } }}>
                              توسيم <ArrowRight size={10} />
                            </button>
                          ) : <span />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-400">
                    <LayoutList className="w-9 h-9 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">لا توجد نتائج</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ FEEDBACK ═══ */}
          {panel === "feedback" && (
            <div className="flex-1 overflow-auto p-5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={15} className="text-slate-400" />
                    <h2 className="font-bold text-slate-800">ملاحظات مراقبة الجودة</h2>
                  </div>
                  {rejectedCount > 0 && (
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full">{rejectedCount} مرفوض</span>
                  )}
                </div>
                {!feedback?.length ? (
                  <div className="p-14 text-center text-slate-400">
                    <MessageSquare className="w-9 h-9 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">لا توجد ملاحظات بعد</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {feedback.map((f: any) => (
                      <div key={f.id} className={cn("p-5", f.status === "rejected" && "bg-red-50/30")}>
                        <div className="flex items-start gap-3 mb-3">
                          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0",
                            f.status === "approved" ? "bg-emerald-100" : f.status === "rejected" ? "bg-red-100" : "bg-slate-100")}>
                            {f.status === "approved" ? <ThumbsUp size={13} className="text-emerald-600" />
                              : f.status === "rejected" ? <ThumbsDown size={13} className="text-red-600" />
                              : <Clock size={13} className="text-slate-500" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn("text-xs font-bold",
                                f.status === "approved" ? "text-emerald-600" : f.status === "rejected" ? "text-red-600" : "text-slate-400")}>
                                {f.status === "approved" ? "✅ مقبول" : f.status === "rejected" ? "❌ مرفوض" : "⏳ قيد المراجعة"}
                              </span>
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(f.createdAt).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed" dir="rtl">{f.taskContent || "—"}</p>
                          </div>
                        </div>
                        {f.feedback && (
                          <div className={cn("mr-11 p-3 rounded-xl text-sm leading-relaxed",
                            f.status === "rejected" ? "bg-red-50 border border-red-100 text-red-800" : "bg-emerald-50 border border-emerald-100 text-emerald-800")}>
                            <span className="font-semibold">ملاحظة: </span>{f.feedback}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ═══ SKIP MODAL ═══ */}
      {showSkipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={() => setShowSkipModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <SkipForward size={17} className="text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">تخطي المهمة</h3>
                <p className="text-[11px] text-slate-400">ستُخصَّص لموسِّم آخر</p>
              </div>
              <button onClick={() => setShowSkipModal(false)} className="mr-auto text-slate-300 hover:text-slate-600"><X size={17} /></button>
            </div>
            <input value={skipReason} onChange={e => setSkipReason(e.target.value)}
              placeholder="سبب التخطي (اختياري)"
              className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowSkipModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all">إلغاء</button>
              <button onClick={() => currentTask && skipTask.mutate({ taskId: currentTask.id, reason: skipReason || undefined })}
                disabled={skipTask.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all disabled:opacity-50">
                {skipTask.isPending ? "جارٍ..." : "تخطي"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SHORTCUTS MODAL ═══ */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard size={16} className="text-slate-500" />
                <h3 className="font-bold text-slate-800">اختصارات لوحة المفاتيح</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="text-slate-300 hover:text-slate-600"><X size={17} /></button>
            </div>
            <div className="space-y-0.5">
              {[
                { key: "Enter", d: "تسليم التوسيم" },
                { key: "S", d: "تخطي المهمة" },
                { key: "→", d: "المهمة السابقة" },
                { key: "←", d: "المهمة التالية" },
                { key: "?", d: "فتح/إغلاق هذه النافذة" },
                { key: "Esc", d: "إغلاق النوافذ" },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between py-2.5 border-b border-slate-50">
                  <span className="text-sm text-slate-600">{s.d}</span>
                  <kbd className="bg-slate-100 border border-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-lg font-mono">{s.key}</kbd>
                </div>
              ))}
              {labelConfig.labels.filter(l => l.shortcut).length > 0 && (<>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider pt-3 pb-1">التصنيفات</p>
                {labelConfig.labels.filter(l => l.shortcut).map(l => (
                  <div key={l.value} className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-sm text-slate-600 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />{l.value}
                    </span>
                    <kbd className="bg-slate-100 border border-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-lg font-mono">{l.shortcut}</kbd>
                  </div>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes popIn {
          0%   { transform: scale(0.6) translateY(20px); opacity: 0; }
          70%  { transform: scale(1.05) translateY(-4px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
