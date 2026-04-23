/**
 * AnnotationComponent — displays a single Label Studio task and its annotation
 * interface. Handles submission, QA feedback display, and task navigation.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import AnnotationWidget from "@/components/annotation/AnnotationWidget";
import type { AnnotationResult, ProjectLabelConfig } from "@/components/annotation/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  SkipForward,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  MessageSquare,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocalTask {
  id: number;
  projectId: number;
  labelStudioTaskId: number;
  content: string;
  status: string;
  assignedTo?: number | null;
  isGroundTruth?: boolean | null;
}

interface QAFeedbackItem {
  id: number;
  annotationId: number;
  status: string;
  feedback?: string | null;
  createdAt: Date | string;
  taskContent?: string;
}

interface AnnotationComponentProps {
  /** The local task to annotate */
  task: LocalTask;
  /** Label config for the annotation widget */
  labelConfig: ProjectLabelConfig;
  /** Total tasks in the current set (for navigation display) */
  totalTasks: number;
  /** 0-based index of this task in the set */
  currentIndex: number;
  /** Navigate to previous task */
  onPrev?: () => void;
  /** Navigate to next task */
  onNext?: () => void;
  /** Called after a successful submission */
  onSubmitted?: () => void;
  /** QA feedback items for this task's annotations */
  feedback?: QAFeedbackItem[];
  /** AI pre-annotation suggestion */
  aiSuggestion?: AnnotationResult | null;
  /** Read-only mode (e.g. for QA review) */
  readOnly?: boolean;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "جديدة",
  in_progress: "قيد العمل",
  submitted: "مُسلَّمة",
  approved: "مقبولة",
  rejected: "مرفوضة",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_progress: "outline",
  submitted: "default",
  approved: "default",
  rejected: "destructive",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnnotationComponent({
  task,
  labelConfig,
  totalTasks,
  currentIndex,
  onPrev,
  onNext,
  onSubmitted,
  feedback = [],
  aiSuggestion,
  readOnly = false,
}: AnnotationComponentProps) {
  const [result, setResult] = useState<AnnotationResult | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Reset annotation state when task changes
  useEffect(() => {
    setResult(null);
  }, [task.id]);

  // Load draft if available
  const { data: draft } = trpc.draft.get.useQuery(
    { taskId: task.id },
    { enabled: !readOnly }
  );
  useEffect(() => {
    if (draft?.result && !result) {
      setResult(draft.result as AnnotationResult);
    }
  }, [draft]);

  // Auto-save draft
  const saveDraft = trpc.draft.save.useMutation();
  useEffect(() => {
    if (!result || readOnly) return;
    const timer = setTimeout(() => {
      saveDraft.mutate({ taskId: task.id, result });
    }, 1500);
    return () => clearTimeout(timer);
  }, [result, task.id, readOnly]);

  // Submit annotation to Label Studio + local DB
  const submitLS = trpc.labelStudio.submitAnnotation.useMutation({
    onSuccess: () => {
      toast.success("✅ تم تسليم التوسيم بنجاح");
      setResult(null);
      onSubmitted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  // Fallback: submit via local tasker route (no LS push)
  const submitLocal = trpc.tasker.submitAnnotation.useMutation({
    onSuccess: () => {
      toast.success("✅ تم تسليم التوسيم بنجاح");
      setResult(null);
      onSubmitted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = useCallback(() => {
    if (!result) {
      toast.error("يرجى إكمال التوسيم أولاً");
      return;
    }

    const isEmpty =
      (!result.labels || result.labels.length === 0) &&
      (!result.spans || result.spans.length === 0) &&
      !result.choice &&
      (!result.entities || result.entities.length === 0);

    if (isEmpty) {
      toast.error("يرجى إكمال التوسيم أولاً");
      return;
    }

    // Try Label Studio submission first; fall back to local-only
    const lsResult = Array.isArray((result as any).lsResult)
      ? (result as any).lsResult
      : [{ type: "choices", value: { choices: result.labels ?? [] } }];

    submitLS.mutate({
      taskId: task.id,
      result: lsResult,
      leadTime: (result as any).timeSpentSeconds,
    });
  }, [result, task.id, submitLS]);

  const isPending = submitLS.isPending || submitLocal.isPending;
  const taskFeedback = feedback.filter((f) => f.taskContent === task.content);

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* ── Task header ── */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center disabled:opacity-30 transition-all"
            >
              <ChevronRight size={14} />
            </button>
            <span className="px-2 text-sm font-bold text-slate-700 tabular-nums">
              {currentIndex + 1}
              <span className="text-slate-300 font-normal"> / </span>
              {totalTasks}
            </span>
            <button
              onClick={onNext}
              disabled={currentIndex >= totalTasks - 1}
              className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Task ID */}
          <span className="text-[11px] text-slate-400 font-mono">
            #{task.id}
          </span>

          {/* Status badge */}
          <Badge variant={STATUS_VARIANT[task.status] ?? "secondary"}>
            {STATUS_LABEL[task.status] ?? task.status}
          </Badge>

          {/* Ground truth indicator */}
          {task.isGroundTruth && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              اختبار
            </Badge>
          )}
        </div>

        {/* Right side: LS link + feedback toggle */}
        <div className="flex items-center gap-2">
          {taskFeedback.length > 0 && (
            <button
              onClick={() => setShowFeedback((s) => !s)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all"
            >
              <MessageSquare size={13} />
              ملاحظات ({taskFeedback.length})
            </button>
          )}
          <a
            href={`${import.meta.env.VITE_LABEL_STUDIO_URL ?? "https://label-studio.up.railway.app"}/tasks/${task.labelStudioTaskId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all"
          >
            <ExternalLink size={13} />
            Label Studio
          </a>
        </div>
      </div>

      {/* ── QA Feedback panel ── */}
      {showFeedback && taskFeedback.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
            <MessageSquare size={14} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">
              ملاحظات مراجع الجودة
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {taskFeedback.map((fb) => (
              <div key={fb.id} className="px-4 py-3 flex items-start gap-3">
                {fb.status === "approved" ? (
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    {fb.status === "approved" ? "مقبول" : "مرفوض"}
                  </p>
                  {fb.feedback && (
                    <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                      {fb.feedback}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-300 mt-1">
                    {new Date(fb.createdAt).toLocaleDateString("ar-SA")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Instructions ── */}
      {labelConfig.instructions && (
        <div className="bg-sky-50 border border-sky-100 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowInstructions((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-sky-100/50 transition-colors"
          >
            <span className="flex items-center gap-2 text-sky-700 text-sm font-semibold">
              <Lightbulb size={13} className="text-sky-500" />
              تعليمات المهمة
            </span>
            {showInstructions ? (
              <ChevronUp size={13} className="text-sky-400" />
            ) : (
              <ChevronDown size={13} className="text-sky-400" />
            )}
          </button>
          {showInstructions && (
            <div className="px-4 pb-3 text-sm text-sky-800 leading-relaxed border-t border-sky-100 pt-2.5">
              {labelConfig.instructions}
            </div>
          )}
        </div>
      )}

      {/* ── Annotation card ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 bg-gradient-to-l from-slate-50 to-white flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-medium">
            منطقة التوسيم
          </span>
          {saveDraft.isPending && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 animate-pulse">
              <RefreshCw size={10} className="animate-spin" />
              حفظ تلقائي...
            </span>
          )}
        </div>
        <div className="p-5">
          <AnnotationWidget
            text={task.content}
            config={labelConfig}
            value={result}
            onChange={setResult}
            aiSuggestion={aiSuggestion}
            readOnly={readOnly}
          />
        </div>
      </div>

      {/* ── Submit button ── */}
      {!readOnly && (
        <Button
          onClick={handleSubmit}
          disabled={!result || isPending}
          className="w-full py-3.5 rounded-2xl font-bold text-[15px] bg-gradient-to-l from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-white shadow-sm hover:shadow-lg hover:shadow-amber-200/50 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin" />
              جارٍ التسليم...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Send size={16} />
              تسليم التوسيم
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
