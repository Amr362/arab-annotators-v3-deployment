/**
 * AnnotationPage — full tasker dashboard for Label Studio-backed annotation.
 *
 * Features:
 *  - Lists all tasks assigned to the current user
 *  - Annotation interface via AnnotationComponent
 *  - Progress tracking
 *  - QA feedback display
 *  - Task filtering & search
 */
import { useState, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AnnotationComponent from "@/components/AnnotationComponent";
import type { ProjectLabelConfig } from "@/components/annotation/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Target,
  Trophy,
  Search,
  RefreshCw,
  LayoutList,
  Brain,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ProjectLabelConfig = {
  type: "classification",
  labels: [
    { value: "إيجابي", color: "#10B981", shortcut: "1" },
    { value: "سلبي", color: "#EF4444", shortcut: "2" },
    { value: "محايد", color: "#94A3B8", shortcut: "3" },
  ],
};

const STATUS_LABEL: Record<string, string> = {
  pending: "جديدة",
  in_progress: "قيد العمل",
  submitted: "مُسلَّمة",
  approved: "مقبولة",
  rejected: "مرفوضة",
};

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400"   },
  in_progress: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  submitted:   { bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-500"     },
  approved:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected:    { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
};

type Panel = "annotate" | "tasks" | "feedback";
type StatusFilter = "all" | "pending" | "in_progress" | "submitted" | "approved" | "rejected";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnnotationPage() {
  const { user } = useAuth();

  const [panel, setPanel] = useState<Panel>("annotate");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Data ──────────────────────────────────────────────────────────────────

  const {
    data: tasks,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = trpc.tasker.getTasks.useQuery();

  const { data: stats, refetch: refetchStats } = trpc.tasker.getStats.useQuery();
  const { data: feedback } = trpc.tasker.getFeedback.useQuery();

  const pendingTasks = (tasks ?? []).filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
  const currentTask = pendingTasks[currentIdx] ?? null;

  const { data: projectData } = trpc.projectConfig.get.useQuery(
    { projectId: currentTask?.projectId ?? 0 },
    { enabled: !!currentTask }
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

  const { data: aiSuggestion } = trpc.aiAnnotation.suggest.useQuery(
    { taskId: currentTask?.id ?? 0, projectId: currentTask?.projectId ?? 0 },
    { enabled: !!currentTask && !!labelConfig.aiPreAnnotation }
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmitted = useCallback(() => {
    refetchTasks();
    refetchStats();
    setCurrentIdx((i) => Math.max(0, Math.min(i, pendingTasks.length - 2)));
  }, [refetchTasks, refetchStats, pendingTasks.length]);

  const handlePrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIdx((i) => Math.min(pendingTasks.length - 1, i + 1));
  }, [pendingTasks.length]);

  // ── Filtered task list ────────────────────────────────────────────────────

  const filteredTasks = (tasks ?? []).filter((t) => {
    const matchSearch =
      !search || t.content.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  const completionPct = stats?.totalCount
    ? ((stats.completedCount ?? 0) / stats.totalCount) * 100
    : 0;

  const rejectedCount =
    (feedback as any[])?.filter((f) => f.status === "rejected").length ?? 0;

  // ── Auth guard ────────────────────────────────────────────────────────────

  if (!user || (user.role !== "tasker" && user.role !== "admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F6FA]">
        <div className="text-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-lg font-bold text-slate-800">غير مصرح</p>
          <p className="text-sm text-slate-400 mt-1">
            هذه الصفحة مخصصة للموسِّمين فقط
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-screen bg-[#F4F6FA] overflow-hidden"
      dir="rtl"
      style={{
        fontFamily:
          "'IBM Plex Sans Arabic', 'Noto Sans Arabic', system-ui, sans-serif",
      }}
    >
      {/* ════════ SIDEBAR ════════ */}
      <aside
        className={cn(
          "flex flex-col bg-[#0D1117] border-l border-white/[0.06] transition-all duration-300 flex-shrink-0",
          sidebarOpen ? "w-[240px]" : "w-[60px]"
        )}
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#00D4A8] to-[#0EA5E9] rounded-xl flex items-center justify-center font-black text-[#0D1117] text-sm flex-shrink-0 shadow-[0_0_20px_rgba(0,212,168,0.3)]">
            AA
          </div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm">Arab Annotators</p>
              <p className="text-white/30 text-[11px]">منصة التوسيم</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mr-auto"
          >
            {sidebarOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* User */}
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <div
            className={cn(
              "flex items-center gap-2.5",
              !sidebarOpen && "justify-center"
            )}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-lg flex-shrink-0">
              {user.name?.[0] ?? "م"}
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-white/30 text-[11px]">موسِّم</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="p-2 space-y-0.5 flex-1">
          {(
            [
              {
                id: "annotate" as Panel,
                label: "التوسيم",
                icon: Brain,
                badge: pendingTasks.length || null,
              },
              {
                id: "tasks" as Panel,
                label: "المهام",
                icon: LayoutList,
                badge: null,
              },
              {
                id: "feedback" as Panel,
                label: "الملاحظات",
                icon: MessageSquare,
                badge: rejectedCount || null,
              },
            ] as const
          ).map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setPanel(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all",
                panel === id
                  ? "bg-white/10 text-white"
                  : "text-white/35 hover:text-white/70 hover:bg-white/5",
                !sidebarOpen && "justify-center px-2"
              )}
            >
              <Icon size={17} className="flex-shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-right">{label}</span>
                  {badge ? (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {badge}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Progress */}
        {sidebarOpen && (
          <div className="p-3 border-t border-white/[0.06] space-y-3">
            <div className="bg-white/[0.04] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-[11px]">التقدم الكلي</span>
                <span className="text-white/60 text-[11px] font-mono tabular-nums">
                  {stats?.completedCount ?? 0}/{stats?.totalCount ?? 0}
                </span>
              </div>
              <Progress value={completionPct} className="h-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.04] rounded-xl p-2.5">
                <p className="text-white/30 text-[10px]">الدقة</p>
                <p className="text-emerald-400 font-black text-base">
                  {stats?.accuracy ?? 0}%
                </p>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-2.5">
                <p className="text-white/30 text-[10px]">اليوم</p>
                <p className="text-amber-400 font-black text-base">
                  {stats?.completedToday ?? 0}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ════════ MAIN ════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">الموسِّم</span>
            <span className="text-slate-200">/</span>
            <span className="text-slate-700 font-semibold">
              {panel === "annotate"
                ? "التوسيم"
                : panel === "tasks"
                ? "قائمة المهام"
                : "ملاحظات الجودة"}
            </span>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-2 mr-auto">
            {(
              [
                {
                  label: "متبقية",
                  v: stats?.pendingCount ?? 0,
                  icon: Clock,
                  c: "bg-sky-50 text-sky-500",
                },
                {
                  label: "مكتملة اليوم",
                  v: stats?.completedToday ?? 0,
                  icon: CheckCircle2,
                  c: "bg-emerald-50 text-emerald-500",
                },
                {
                  label: "الدقة",
                  v: `${stats?.accuracy ?? 0}%`,
                  icon: Target,
                  c: "bg-violet-50 text-violet-500",
                },
                {
                  label: "الإجمالي",
                  v: stats?.totalCompleted ?? 0,
                  icon: Trophy,
                  c: "bg-amber-50 text-amber-500",
                },
              ] as const
            ).map(({ label, v, icon: Icon, c }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-100 shadow-sm"
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0",
                    c
                  )}
                >
                  <Icon size={13} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 leading-none">
                    {label}
                  </p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums leading-tight">
                    {v}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {/* ═══ ANNOTATE PANEL ═══ */}
          {panel === "annotate" && (
            <>
              {tasksLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-14 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-3xl" />
                  <Skeleton className="h-12 w-full rounded-2xl" />
                </div>
              ) : pendingTasks.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-xs">
                    <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                      أنجزت كل المهام! 🎉
                    </h3>
                    <p className="text-slate-400 text-sm mb-5">
                      لا توجد مهام معلقة حالياً
                    </p>
                    <button
                      onClick={() => refetchTasks()}
                      className="flex items-center gap-2 mx-auto text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:shadow transition-all"
                    >
                      <RefreshCw size={14} /> تحديث
                    </button>
                  </div>
                </div>
              ) : currentTask ? (
                <AnnotationComponent
                  task={currentTask}
                  labelConfig={labelConfig}
                  totalTasks={pendingTasks.length}
                  currentIndex={currentIdx}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  onSubmitted={handleSubmitted}
                  feedback={(feedback as any[]) ?? []}
                  aiSuggestion={aiSuggestion as any}
                />
              ) : null}
            </>
          )}

          {/* ═══ TASKS PANEL ═══ */}
          {panel === "tasks" && (
            <div className="space-y-4">
              {/* Search + filter */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث في المهام..."
                    className="pr-9 text-sm rounded-xl border-slate-200"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter size={13} className="text-slate-400" />
                  {(
                    ["all", "pending", "submitted", "approved", "rejected"] as StatusFilter[]
                  ).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all",
                        statusFilter === s
                          ? "bg-slate-800 text-white"
                          : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {s === "all"
                        ? "الكل"
                        : STATUS_LABEL[s] ?? s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task list */}
              {tasksLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <LayoutList size={32} className="mx-auto mb-3 opacity-30" />
                  <p>لا توجد مهام مطابقة</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTasks.map((task, idx) => {
                    const sc = STATUS_COLOR[task.status] ?? STATUS_COLOR.pending;
                    const isPending =
                      task.status === "pending" || task.status === "in_progress";
                    return (
                      <button
                        key={task.id}
                        onClick={() => {
                          if (isPending) {
                            const pendingIdx = pendingTasks.findIndex(
                              (t) => t.id === task.id
                            );
                            if (pendingIdx !== -1) {
                              setCurrentIdx(pendingIdx);
                              setPanel("annotate");
                            }
                          }
                        }}
                        className={cn(
                          "w-full text-right bg-white rounded-2xl border border-slate-100 px-4 py-3 shadow-sm transition-all",
                          isPending
                            ? "hover:border-amber-200 hover:shadow-md cursor-pointer"
                            : "cursor-default opacity-80"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 truncate leading-snug">
                              {task.content}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                              #{task.id} · LS#{task.labelStudioTaskId}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                              sc.bg,
                              sc.text
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                sc.dot
                              )}
                            />
                            {STATUS_LABEL[task.status] ?? task.status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ FEEDBACK PANEL ═══ */}
          {panel === "feedback" && (
            <div className="space-y-3">
              {!(feedback as any[])?.length ? (
                <div className="text-center py-16 text-slate-400">
                  <MessageSquare
                    size={32}
                    className="mx-auto mb-3 opacity-30"
                  />
                  <p>لا توجد ملاحظات بعد</p>
                </div>
              ) : (
                (feedback as any[]).map((fb: any) => (
                  <div
                    key={fb.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      {fb.status === "approved" ? (
                        <CheckCircle2
                          size={16}
                          className="text-emerald-500 mt-0.5 flex-shrink-0"
                        />
                      ) : (
                        <AlertCircle
                          size={16}
                          className="text-red-400 mt-0.5 flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant={
                              fb.status === "approved"
                                ? "default"
                                : "destructive"
                            }
                            className="text-[10px]"
                          >
                            {fb.status === "approved" ? "مقبول" : "مرفوض"}
                          </Badge>
                          <span className="text-[11px] text-slate-400">
                            {new Date(fb.createdAt).toLocaleDateString("ar-SA")}
                          </span>
                        </div>
                        {fb.taskContent && (
                          <p className="text-sm text-slate-600 truncate mb-1">
                            {fb.taskContent}
                          </p>
                        )}
                        {fb.feedback && (
                          <p className="text-sm text-slate-500 leading-relaxed bg-slate-50 rounded-xl px-3 py-2 mt-1">
                            {fb.feedback}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
