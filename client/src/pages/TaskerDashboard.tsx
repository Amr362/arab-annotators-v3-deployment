// UPGRADED PREMIUM TASKER DASHBOARD v5 — Profile + Projects + Modern UI
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, Clock, Zap, MessageSquare, Search,
  Timer, SkipForward, Save, Keyboard, BookOpen, ChevronRight,
  ChevronLeft, Trophy, Star, LayoutList, Flame, Target, Coins,
  ThumbsUp, ThumbsDown, Sparkles, Brain, Layers, ArrowRight,
  Check, X, RefreshCw, Lightbulb, ChevronDown, ChevronUp,
  User, FolderOpen, BarChart3, Shield, Edit3, Camera, Award,
  TrendingUp, Activity, Briefcase, Globe, Hash, Lock,
  Mail, Calendar, Badge, Folder,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import WorkerProgressTracker from "@/components/WorkerProgressTracker";
import FeedbackInbox from "@/components/FeedbackInbox";
import WorkerMetricsCard from "@/components/WorkerMetricsCard";
import AnnotationWidget from "@/components/annotation/AnnotationWidget";
import type { AnnotationResult, ProjectLabelConfig } from "@/components/annotation/types";
import { cn } from "@/lib/utils";

/* ─────────────────── constants ─────────────────── */

const statusLabel: Record<string, string> = {
  pending: "جديدة", in_progress: "قيد العمل", submitted: "مُسلَّمة",
  approved: "مقبولة ✅", rejected: "مرفوضة ❌",
};
const statusColor: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400"   },
  in_progress: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  submitted:   { bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-500"     },
  approved:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected:    { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
};
const projectStatusColor: Record<string, { bg: string; text: string; border: string }> = {
  active:    { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  paused:    { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200"   },
  completed: { bg: "bg-slate-50",    text: "text-slate-600",   border: "border-slate-200"   },
};
const projectStatusLabel: Record<string, string> = {
  active: "نشط", paused: "موقوف", completed: "مكتمل",
};
const annotationTypeLabel: Record<string, { label: string; color: string }> = {
  classification:       { label: "تصنيف نصي",      color: "bg-violet-100 text-violet-700" },
  multi_classification: { label: "تصنيف متعدد",    color: "bg-blue-100 text-blue-700"    },
  ner:                  { label: "تحديد كيانات",   color: "bg-pink-100 text-pink-700"    },
  pairwise:             { label: "مقارنة نصين",    color: "bg-orange-100 text-orange-700"},
  relations:            { label: "علاقات",          color: "bg-cyan-100 text-cyan-700"    },
  html_interface:       { label: "واجهة تفاعلية",  color: "bg-slate-100 text-slate-700"  },
};

const LEVELS = [
  { name: "مبتدئ",  min: 0,    icon: "🌱", color: "#94A3B8", bg: "from-slate-400 to-slate-500" },
  { name: "متقدم",  min: 50,   icon: "⚡", color: "#F59E0B", bg: "from-amber-400 to-amber-500" },
  { name: "محترف",  min: 150,  icon: "🔥", color: "#F97316", bg: "from-orange-400 to-orange-500" },
  { name: "خبير",   min: 400,  icon: "💎", color: "#8B5CF6", bg: "from-violet-400 to-violet-500" },
  { name: "أسطورة", min: 1000, icon: "👑", color: "#EAB308", bg: "from-yellow-400 to-amber-500" },
];
function getLevel(pts: number) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (pts >= l.min) lv = l;
  const nx = LEVELS[LEVELS.indexOf(lv) + 1];
  const pct = nx ? ((pts - lv.min) / (nx.min - lv.min)) * 100 : 100;
  return { ...lv, next: nx, pct };
}

const ACHIEVEMENTS = [
  { id: "first",    icon: "🎯", name: "أول خطوة",     desc: "أتمم مهمتك الأولى",           threshold: 1,    field: "totalCompleted" },
  { id: "ten",      icon: "🔟", name: "عشرة أقوياء",  desc: "أتمم 10 مهام",                threshold: 10,   field: "totalCompleted" },
  { id: "hundred",  icon: "💯", name: "مئوي",          desc: "أتمم 100 مهمة",               threshold: 100,  field: "totalCompleted" },
  { id: "fast",     icon: "⚡", name: "البرق",          desc: "أتمم 10 مهام في يوم واحد",   threshold: 10,   field: "completedToday" },
  { id: "accurate", icon: "🎯", name: "الدقيق",        desc: "دقة 90%+",                    threshold: 90,   field: "accuracy"       },
  { id: "streak3",  icon: "🔥", name: "ثلاثية نارية",  desc: "3 أيام متتالية",              threshold: 3,    field: "streak"         },
];

const DEFAULT_CONFIG: ProjectLabelConfig = {
  type: "classification",
  labels: [
    { value: "إيجابي", color: "#10B981", shortcut: "1" },
    { value: "سلبي",   color: "#EF4444", shortcut: "2" },
    { value: "محايد",  color: "#94A3B8", shortcut: "3" },
  ],
};
const TASK_TYPE_LABEL: Record<string, string> = {
  classification: "تصنيف نصي", multi_classification: "تصنيف متعدد",
  ner: "تحديد كيانات", pairwise: "مقارنة نصين", relations: "علاقات",
};

type Panel = "annotate" | "tasks" | "projects" | "feedback" | "profile";

/* ─────────────────── hooks ─────────────────── */

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

/* ─────────────────── sub-components ─────────────────── */

function StatCard({ label, value, icon: Icon, gradient, sub }: {
  label: string; value: string | number; icon: any; gradient: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", gradient)}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900 tabular-nums leading-none mb-1">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function AchievementBadge({ achievement, unlocked }: { achievement: typeof ACHIEVEMENTS[0]; unlocked: boolean }) {
  return (
    <div className={cn(
      "relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all",
      unlocked
        ? "bg-white border-amber-200 shadow-sm shadow-amber-100/50"
        : "bg-slate-50/50 border-slate-100 opacity-50 grayscale"
    )}>
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
        unlocked ? "bg-amber-50" : "bg-slate-100"
      )}>
        {achievement.icon}
      </div>
      <div className="text-center">
        <p className={cn("text-xs font-bold", unlocked ? "text-slate-800" : "text-slate-500")}>{achievement.name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{achievement.desc}</p>
      </div>
      {unlocked && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
          <Check size={10} className="text-white" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, myTaskCount, onStartWork, isStarting }: {
  project: any;
  myTaskCount?: number;
  onStartWork?: (projectId: number) => void;
  isStarting?: boolean;
}) {
  const pct = project.totalItems > 0 ? (project.completedItems / project.totalItems) * 100 : 0;
  const sc = projectStatusColor[project.status] ?? projectStatusColor.active;
  const tc = annotationTypeLabel[project.annotationType ?? "classification"];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group p-5 flex flex-col">
      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00D4A8]/20 to-[#0EA5E9]/20 border border-[#00D4A8]/20 flex items-center justify-center flex-shrink-0">
            <Folder size={18} className="text-[#00D4A8]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-800 text-sm leading-tight truncate">{project.name}</h3>
            {project.description && (
              <p className="text-[12px] text-slate-400 mt-0.5 line-clamp-1">{project.description}</p>
            )}
          </div>
        </div>
        <span className={cn("flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border", sc.bg, sc.text, sc.border)}>
          {projectStatusLabel[project.status] ?? project.status}
        </span>
      </div>

      {/* type badge */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", tc?.color ?? "bg-slate-100 text-slate-600")}>
          {tc?.label ?? project.annotationType}
        </span>
        {project.aiPreAnnotation && (
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 flex items-center gap-1">
            <Brain size={9} /> AI مُفعَّل
          </span>
        )}
        {myTaskCount !== undefined && myTaskCount > 0 && (
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {myTaskCount} مهمة لك
          </span>
        )}
      </div>

      {/* progress */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">التقدم الكلي</span>
          <span className="text-[11px] font-bold text-slate-700 tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? "#10B981" : pct > 50 ? "#0EA5E9" : "#F59E0B",
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{project.completedItems?.toLocaleString("ar") ?? 0} مكتملة</span>
          <span>{project.totalItems?.toLocaleString("ar") ?? 0} إجمالي</span>
        </div>
      </div>

      {/* Action Button */}
      {project.status === "active" && onStartWork && (
        <button
          onClick={() => onStartWork(project.id)}
          disabled={isStarting}
          className="mt-auto w-full py-2 rounded-xl bg-slate-50 hover:bg-[#00D4A8] hover:text-white text-slate-600 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-100 hover:border-[#00D4A8]"
        >
          {isStarting ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <>
              <Zap size={14} />
              ابدأ العمل
            </>
          )}
        </button>
      )}
    </div>
  );
}

/* ─────────────────── main ─────────────────── */

export default function TaskerDashboard() {
  const { user } = useAuth();

  const [panel, setPanel] = useState<Panel>("projects");
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

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");

  const timer = useTimer(true);
  const { data: tasks, isLoading, refetch } = trpc.tasker.getTasks.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.tasker.getStats.useQuery();
  const { data: feedback } = trpc.tasker.getFeedback.useQuery();
  // Get all active projects that tasker can work on
  const { data: allProjects } = trpc.tasker.getAvailableProjects.useQuery();

  // Queue-based task pull: tasker requests the next available task from the pool
  const startTaskMutation = trpc.tasker.startTask.useMutation();

  const getNextTask = trpc.tasker.getNextTask.useMutation({
    onSuccess: (task) => {
      if (!task) { toast("🗕️ لا توجد مهام متاحة حالياً"); return; }
      toast.success("✅ تم تخصيص مهمة جديدة");
      refetch(); refetchStats();
      // Switch to annotation panel immediately after getting task
      setPanel("annotate");
      setCurrentIdx(0);
    },
    onError: e => toast.error(e.message),
  });

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

  // Fix memory leak: single postMessage listener managed by useEffect
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "annotation_result") {
        setAnnotationResult(ev.data.result);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Send task content to html_interface iframe when task changes
  const htmlIframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!currentTask || projectData?.annotationType !== "html_interface") return;
    const iframe = htmlIframeRef.current;
    if (!iframe) return;
    const sendContent = () => {
      try {
        iframe.contentWindow?.postMessage(
          { type: "task_content", content: currentTask.content, taskId: currentTask.id },
          "*"
        );
      } catch {}
    };
    iframe.addEventListener("load", sendContent);
    return () => iframe.removeEventListener("load", sendContent);
  }, [currentTask?.id, projectData?.annotationType]);

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

  // v4: skip quota display
  const projectId = currentTask
    ? (currentTask as any).projectId ?? 0
    : 0;
  const { data: skipStatus } = trpc.tasker.getSkipStatus.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

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
    if (!currentTask) return;
    const isHtmlInterface = projectData?.annotationType === "html_interface";

    if (isHtmlInterface) {
      // For html_interface: submit with whatever result was received from postMessage, or a default
      const result = annotationResult ?? { html_interface: true, taskContent: currentTask.content, timeSpentSeconds: timer.seconds };
      await submitAnnotation.mutateAsync({ taskId: currentTask.id, result });
      return;
    }

    if (!annotationResult) return;
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

  // Compute my task counts per project
  const myProjectMap: Record<number, number> = {};
  (tasks ?? []).forEach((t: any) => {
    if (t.projectId) myProjectMap[t.projectId] = (myProjectMap[t.projectId] ?? 0) + 1;
  });

  // Achievements unlock logic
  const achievementUnlocked = (a: typeof ACHIEVEMENTS[0]) => {
    const s = stats as any;
    if (!s) return false;
    if (a.field === "totalCompleted") return (s.totalCompleted ?? 0) >= a.threshold;
    if (a.field === "completedToday") return (s.completedToday ?? 0) >= a.threshold;
    if (a.field === "accuracy") return (s.accuracy ?? 0) >= a.threshold;
    if (a.field === "streak") return (s.streak ?? 0) >= a.threshold;
    return false;
  };

  // Note: "annotate" panel is hidden from sidebar, only accessible via "Start Work" button
  const NAV_ITEMS: { id: Panel; label: string; icon: any; badge?: number | null }[] = [
    { id: "projects",  label: "المشاريع",      icon: FolderOpen,   badge: (allProjects?.filter((p: any) => p.status === "active").length) || null },
    { id: "feedback",  label: "الملاحظات",    icon: MessageSquare, badge: rejectedCount || null },
    { id: "profile",   label: "ملفي الشخصي",  icon: User,         badge: null },
  ];
  return (
    <div
      className="flex h-screen bg-[#F4F6FA] overflow-hidden"
      dir="rtl"
      style={{ fontFamily: "'IBM Plex Sans Arabic', 'Noto Sans Arabic', system-ui, sans-serif" }}
    >

      {/* ── SUCCESS ANIMATION ── */}
      {showSuccess && (
        <div className="fixed inset-0 pointer-events-none z-[60] flex items-center justify-center">
          <div
            className="bg-emerald-500 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-3 text-xl font-bold"
            style={{ animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}
          >
            <Check className="w-7 h-7" />
            أحسنت! {earnedPoints && <span className="text-emerald-100 text-base">+{earnedPoints} نقطة</span>}
          </div>
        </div>
      )}

      {/* ════════ LEFT SIDEBAR ════════ */}
      <aside className={cn(
        "flex flex-col bg-[#0D1117] border-l border-white/[0.06] transition-all duration-300 flex-shrink-0",
        sidebarOpen ? "w-[240px]" : "w-[60px]"
      )}>
        {/* Logo */}
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
        <button
          onClick={() => setPanel("profile")}
          className={cn(
            "px-3 py-3 border-b border-white/[0.06] text-right w-full transition-colors",
            panel === "profile" ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
          )}
        >
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
        </button>

        {/* Nav */}
        <nav className="p-2 space-y-0.5 flex-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setPanel(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all",
                panel === id ? "bg-white/10 text-white" : "text-white/35 hover:text-white/70 hover:bg-white/5",
                !sidebarOpen && "justify-center px-2"
              )}
            >
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-right">{label}</span>
                  {badge ? (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
                  ) : null}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom stats */}
        {sidebarOpen && (
          <div className="p-3 border-t border-white/[0.06] space-y-2">
            <div className="bg-white/[0.04] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-[11px]">سلسلة الأيام</span>
                <Flame size={13} className="text-orange-400" />
              </div>
              <div className="flex gap-1 mb-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className={cn(
                    "flex-1 rounded-sm",
                    i < streak ? "bg-orange-400" : "bg-white/10",
                    i === streak - 1 ? "h-5" : i === streak - 2 ? "h-3.5" : "h-2.5"
                  )} />
                ))}
              </div>
              <p className="text-white text-[11px] font-semibold">{streak} أيام متتالية 🔥</p>
            </div>
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
              {panel === "annotate" ? "التوسيم" : NAV_ITEMS.find(n => n.id === panel)?.label}
            </span>
          </div>
          {panel === "annotate" && (
            <button
              onClick={() => setPanel("projects")}
              className="ml-auto text-xs text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-all border border-slate-200 flex items-center gap-1.5"
            >
              <ChevronLeft size={14} /> عودة للمشاريع
            </button>
          )}

          {panel === "annotate" && (
            <div className="flex-1 max-w-sm mx-auto flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-amber-500 to-amber-400 rounded-full transition-all duration-700"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap tabular-nums">
                {stats?.completedCount ?? 0}<span className="text-slate-200">/</span>{stats?.totalCount ?? 0}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mr-auto">
            {isSaving && <span className="text-xs text-slate-400 flex items-center gap-1 animate-pulse"><RefreshCw size={11} className="animate-spin" />حفظ...</span>}
            {savedAt && !isSaving && <span className="text-xs text-slate-300 flex items-center gap-1"><Check size={11} className="text-emerald-400" />محفوظ</span>}
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-all border border-slate-200"
            >
              <Keyboard size={13} /><span>مساعدة</span><kbd className="text-[9px] bg-white border border-slate-200 px-1 rounded font-mono">?</kbd>
            </button>
          </div>
        </header>

        {/* Stats strip - only on annotate */}
        {panel === "annotate" && (
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
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">

          {/* ═══════════════════════════════
              ANNOTATE PANEL
          ═══════════════════════════════ */}
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
                      <p className="text-slate-400 text-sm mb-5">لا توجد مهام معيّنة لك — احصل على مهمة جديدة من القائمة</p>
                      <div className="flex flex-col gap-2 items-center">
                        <button
                          onClick={() => getNextTask.mutate({})}
                          disabled={getNextTask.isPending}
                          className="flex items-center gap-2 mx-auto text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2.5 rounded-xl shadow-sm hover:shadow transition-all"
                        >
                          {getNextTask.isPending ? "جارٍ التخصيص..." : "🎯 احصل على مهمة جديدة"}
                        </button>
                        <button onClick={() => refetch()} className="flex items-center gap-2 mx-auto text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:shadow transition-all">
                          <RefreshCw size={14} /> تحديث
                        </button>
                      </div>
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
                      {skipStatus && skipStatus.remaining === 0 && (
                        <span className="text-xs text-red-400 px-1.5">لا تخطيات متبقية</span>
                      )}
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
                            ref={htmlIframeRef}
                            srcDoc={projectData.instructions ?? ""}
                            className="w-full border-0"
                            style={{ minHeight: "360px" }}
                            sandbox="allow-scripts allow-same-origin"
                            title="task-interface"
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

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={(projectData?.annotationType !== "html_interface" && !annotationResult) || submitAnnotation.isPending}
                    className="w-full py-3.5 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all duration-200 bg-gradient-to-l from-amber-500 to-amber-400 text-white shadow-sm hover:from-amber-600 hover:to-amber-500 hover:shadow-lg hover:shadow-amber-200/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
                  >
                    {submitAnnotation.isPending
                      ? <><RefreshCw size={16} className="animate-spin" />جارٍ الإرسال...</>
                      : <><Check size={17} />تسليم التوسيم<kbd className="text-[10px] bg-white/20 px-2 py-0.5 rounded-lg font-mono border border-white/10">Enter</kbd></>
                    }
                  </button>

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

          {/* ═══════════════════════════════
              TASKS PANEL - HIDDEN (moved to Projects)
          ═══════════════════════════════ */}
          {false && panel === "tasks" && (
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

          {/* ═══════════════════════════════
              PROJECTS PANEL (NEW)
          ═══════════════════════════════ */}
          {panel === "projects" && (
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900">المشاريع</h1>
                  <p className="text-sm text-slate-500 mt-0.5">جميع مشاريع التوسيم المتاحة</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <Activity size={14} className="text-emerald-500" />
                    <span className="font-semibold">{allProjects?.filter((p: any) => p.status === "active").length ?? 0}</span>
                    <span className="text-slate-400">نشط</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <CheckCircle2 size={14} className="text-slate-400" />
                    <span className="font-semibold">{allProjects?.filter((p: any) => p.status === "completed").length ?? 0}</span>
                    <span className="text-slate-400">مكتمل</span>
                  </div>
                </div>
              </div>

              {/* My assigned projects */}
              {Object.keys(myProjectMap).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
                    <h2 className="text-sm font-bold text-slate-700">مشاريعي المُخصَّصة</h2>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{Object.keys(myProjectMap).length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(allProjects ?? [])
                      .filter((p: any) => myProjectMap[p.id])
                      .map((p: any) => (
                        <ProjectCard
                          key={p.id}
                          project={p}
                          myTaskCount={myProjectMap[p.id]}
                          onStartWork={(pid) => getNextTask.mutate({ projectId: pid })}
                          isStarting={getNextTask.isPending}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* All active projects */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                  <h2 className="text-sm font-bold text-slate-700">جميع المشاريع النشطة</h2>
                </div>
                {!allProjects ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : allProjects.filter((p: any) => p.status === "active").length === 0 ? (
                  <div className="text-center py-16">
                    <FolderOpen className="w-12 h-12 mx-auto mb-4 text-slate-200" />
                    <p className="text-slate-500 font-medium">لا توجد مشاريع نشطة حالياً</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(allProjects ?? [])
                      .filter((p: any) => p.status === "active")
                      .map((p: any) => (
                        <ProjectCard
                        key={p.id}
                        project={p}
                        onStartWork={(pid) => getNextTask.mutate({ projectId: pid })}
                        isStarting={getNextTask.isPending}
                      />
                      ))}
                  </div>
                )}
              </div>

              {/* Completed projects */}
              {(allProjects ?? []).filter((p: any) => p.status === "completed").length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-4 bg-slate-300 rounded-full" />
                    <h2 className="text-sm font-bold text-slate-500">المشاريع المكتملة</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 opacity-70">
                    {(allProjects ?? [])
                      .filter((p: any) => p.status === "completed")
                      .map((p: any) => (
                        <ProjectCard
                        key={p.id}
                        project={p}
                        onStartWork={(pid) => getNextTask.mutate({ projectId: pid })}
                        isStarting={getNextTask.isPending}
                      />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════
              FEEDBACK PANEL
          ═══════════════════════════════ */}
          {panel === "feedback" && (
            <FeedbackInbox
              items={(feedback ?? []).map((f: any) => ({
                id: f.id,
                taskId: f.taskId,
                taskContent: f.taskContent,
                status: f.status,
                feedback: f.feedback,
                isHoneyPotCheck: f.isHoneyPotCheck ?? false,
                honeyPotPassed: f.honeyPotPassed,
                createdAt: f.createdAt,
              }))}
              onViewGuidelines={() => setPanel("projects")}
            />
          )}

          {/* ═══════════════════════════════
              PROFILE PANEL (NEW)
          ═══════════════════════════════ */}
          {panel === "profile" && (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto space-y-6">

                {/* Profile Hero */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Banner */}
                  <div className="h-24 bg-gradient-to-l from-[#00D4A8]/30 via-[#0EA5E9]/20 to-[#8B5CF6]/20 relative">
                    <div className="absolute inset-0" style={{
                      backgroundImage: "radial-gradient(circle at 20% 50%, rgba(0,212,168,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 50%, rgba(14,165,233,0.1) 0%, transparent 60%)"
                    }} />
                  </div>

                  <div className="px-6 pb-6">
                    {/* Avatar row */}
                    <div className="flex items-end justify-between -mt-8 mb-4">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-3xl shadow-xl border-4 border-white">
                          {user.name?.[0] ?? "م"}
                        </div>
                        <div className="absolute -bottom-1 -right-1 text-xl leading-none">{level.icon}</div>
                      </div>
                      <button
                        onClick={() => { setEditingProfile(e => !e); setEditName(user.name ?? ""); }}
                        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl transition-all"
                      >
                        <Edit3 size={14} />
                        {editingProfile ? "إلغاء" : "تعديل الملف"}
                      </button>
                    </div>

                    {/* Name & info */}
                    {editingProfile ? (
                      <div className="space-y-3 mb-4">
                        <div>
                          <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1 block">الاسم</label>
                          <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00D4A8]/30 focus:border-[#00D4A8]"
                          />
                        </div>
                        <button
                          onClick={() => { toast.success("تم حفظ الاسم"); setEditingProfile(false); }}
                          className="flex items-center gap-2 text-sm font-bold text-white bg-[#00D4A8] hover:bg-[#00bfa5] px-4 py-2 rounded-xl transition-all"
                        >
                          <Check size={14} /> حفظ التغييرات
                        </button>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <h2 className="text-xl font-black text-slate-900">{user.name}</h2>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="flex items-center gap-1.5 text-sm text-slate-500">
                            <Mail size={13} className="text-slate-400" />{user.email ?? "—"}
                          </span>
                          <span className="flex items-center gap-1.5 text-sm text-slate-500">
                            <Shield size={13} className="text-[#00D4A8]" />
                            {user.role === "admin" ? "مدير" : user.role === "tasker" ? "موسِّم" : user.role}
                          </span>
                          <span className="flex items-center gap-1.5 text-sm text-slate-500">
                            <Calendar size={13} className="text-slate-400" />
                            عضو منذ {new Date(user.createdAt ?? Date.now()).toLocaleDateString("ar-SA", { year: "numeric", month: "long" })}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Level bar */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{level.icon}</span>
                          <div>
                            <p className="text-sm font-black text-slate-800">{level.name}</p>
                            <p className="text-[11px] text-slate-400">{totalPts.toLocaleString("ar")} نقطة</p>
                          </div>
                        </div>
                        {level.next && (
                          <div className="text-left">
                            <p className="text-[11px] text-slate-400">المستوى التالي</p>
                            <p className="text-sm font-bold text-slate-600">{level.next.name} {level.next.icon}</p>
                          </div>
                        )}
                      </div>
                      <div className="h-2 bg-white rounded-full border border-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${level.pct}%`, backgroundColor: level.color }}
                        />
                      </div>
                      {level.next && (
                        <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                          يتبقى {(level.next.min - totalPts).toLocaleString("ar")} نقطة للمستوى التالي
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <BarChart3 size={15} className="text-slate-400" /> إحصائياتي
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard
                      label="إجمالي المكتملة"
                      value={(stats?.totalCompleted ?? 0).toLocaleString("ar")}
                      icon={CheckCircle2}
                      gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
                    />
                    <StatCard
                      label="مكتملة اليوم"
                      value={stats?.completedToday ?? 0}
                      icon={Zap}
                      gradient="bg-gradient-to-br from-amber-400 to-orange-500"
                      sub="مهمة اليوم"
                    />
                    <StatCard
                      label="دقة التوسيم"
                      value={`${stats?.accuracy ?? 0}%`}
                      icon={Target}
                      gradient="bg-gradient-to-br from-violet-500 to-violet-600"
                    />
                    <StatCard
                      label="متبقية"
                      value={stats?.pendingCount ?? 0}
                      icon={Clock}
                      gradient="bg-gradient-to-br from-sky-500 to-sky-600"
                      sub="مهمة معلقة"
                    />
                  </div>
                </div>

                {/* v4: Live quality metrics from StatsWorker */}
                <WorkerMetricsCard
                  projectId={(allProjects ?? [])[0]?.id}
                />

                {/* Streak + Earnings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Streak */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Flame size={15} className="text-orange-400" /> سلسلة الأيام
                      </h3>
                      <span className="text-2xl font-black text-orange-500">{streak}</span>
                    </div>
                    <div className="flex gap-1.5 mb-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className={cn(
                            "w-full rounded-lg transition-all",
                            i < streak ? "bg-orange-400 h-10" : "bg-slate-100 h-10"
                          )} />
                          <span className="text-[9px] text-slate-400">
                            {["أح","إث","ث","أر","خ","ج","س"][i]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-slate-600 font-medium">{streak} أيام متتالية 🔥</p>
                  </div>

                  {/* Earnings */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <TrendingUp size={15} className="text-emerald-500" /> الأرباح
                      </h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div>
                          <p className="text-[11px] text-emerald-600 font-medium">أرباح اليوم</p>
                          <p className="text-xl font-black text-emerald-700">${((stats?.completedToday ?? 0) * 0.15).toFixed(2)}</p>
                        </div>
                        <div className="text-emerald-300 text-2xl">💰</div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium">إجمالي الأرباح</p>
                          <p className="text-xl font-black text-slate-800">${((stats?.totalCompleted ?? 0) * 0.15).toFixed(2)}</p>
                        </div>
                        <div className="text-slate-200 text-2xl">🏦</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Achievements */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <Award size={15} className="text-amber-400" />
                    الإنجازات
                    <span className="text-xs text-slate-400 font-normal">
                      {ACHIEVEMENTS.filter(a => achievementUnlocked(a)).length} / {ACHIEVEMENTS.length} مفتوح
                    </span>
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {ACHIEVEMENTS.map(a => (
                      <AchievementBadge key={a.id} achievement={a} unlocked={achievementUnlocked(a)} />
                    ))}
                  </div>
                </div>

                {/* Account settings */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-2">
                    <Lock size={14} className="text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-700">إعدادات الحساب</h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {[
                      { icon: User, label: "الاسم الكامل", value: user.name ?? "—" },
                      { icon: Mail, label: "البريد الإلكتروني", value: user.email ?? "—" },
                      { icon: Shield, label: "الدور", value: user.role === "tasker" ? "موسِّم" : user.role === "admin" ? "مدير" : user.role },
                      { icon: Hash, label: "معرّف المستخدم", value: `#${user.id}` },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center">
                            <Icon size={13} className="text-slate-500" />
                          </div>
                          <span className="text-sm text-slate-600">{label}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-800">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
            {skipStatus !== undefined && (
              <div className={`text-xs px-3 py-1.5 rounded-lg mb-1 ${
                skipStatus.remaining === 0
                  ? "bg-red-50 text-red-600"
                  : skipStatus.remaining === 1
                  ? "bg-amber-50 text-amber-600"
                  : "bg-slate-50 text-slate-500"
              }`}>
                {skipStatus.remaining === 0
                  ? `⛔ وصلت لحد التخطيات (${3}/3). انتظر ${Math.ceil(skipStatus.resetsIn / 60000)} دقيقة.`
                  : `🔄 متبقي ${skipStatus.remaining} تخطيات من أصل 3 هذه الساعة`
                }
              </div>
            )}
            <input value={skipReason} onChange={e => setSkipReason(e.target.value)}
              placeholder="سبب التخطي (اختياري)"
              className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowSkipModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all">إلغاء</button>
              <button
                onClick={() => currentTask && skipTask.mutate({ taskId: currentTask.id, projectId: (currentTask as any).projectId ?? 0, reason: skipReason || undefined })}
                disabled={skipTask.isPending || skipStatus?.remaining === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all disabled:opacity-50"
              >
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
