import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, CheckCircle2, XCircle, TrendingUp, MessageSquare,
  Keyboard, Bot, ShieldAlert, Activity, ChevronLeft, Folder,
  User, Clock, ArrowRight, LayoutGrid,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

function AiReviewBadge({ annotationId }: { annotationId: number }) {
  const { data, isLoading } = trpc.aiTools.qaReview.useQuery({ annotationId }, { retry: false });
  if (isLoading) return <span className="text-xs text-slate-400 animate-pulse">🤖 AI يحلل...</span>;
  if (!data) return null;
  const color =
    data.verdict === "approve" ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : data.verdict === "reject" ? "text-red-600 bg-red-50 border-red-200"
    : "text-amber-600 bg-amber-50 border-amber-200";
  const icon = data.verdict === "approve" ? "✅" : data.verdict === "reject" ? "❌" : "⚠️";
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${color} mt-2`}>
      <Bot size={12} className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-semibold">
          {icon} AI: {data.verdict === "approve" ? "يُوصي بالقبول" : data.verdict === "reject" ? "يُوصي بالرفض" : "غير محدد"}
        </span>
        <span className="opacity-70 mr-1">({data.confidence}% ثقة)</span>
        {data.reason && <p className="opacity-80 mt-0.5">{data.reason}</p>}
      </div>
    </div>
  );
}

function SpamBadge({ annotationId }: { annotationId: number }) {
  const { data, isLoading } = trpc.aiTools.spamCheck.useQuery({ annotationId }, { retry: false });
  if (isLoading || !data || !data.isSpam) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border text-xs text-orange-600 bg-orange-50 border-orange-200 mt-2">
      <ShieldAlert size={12} className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-semibold">⚠️ محتمل إجابة عشوائية ({data.confidence}% ثقة)</span>
        {data.reason && <p className="opacity-80 mt-0.5">{data.reason}</p>}
      </div>
    </div>
  );
}

function ProjectsView({
  onSelectProject,
  stats,
}: {
  onSelectProject: (id: number, name: string) => void;
  stats: any;
}) {
  const { data: projectCounts = [], isLoading } = trpc.qa.getProjectCounts.useQuery();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "معلقة", value: stats?.pendingReviews ?? 0, icon: AlertCircle, color: "text-yellow-500" },
          { label: "مكتملة", value: stats?.completedReviews ?? 0, icon: CheckCircle2, color: "text-green-500" },
          { label: "معدل القبول", value: `${stats?.agreementRate ?? 0}%`, icon: TrendingUp, color: "text-blue-500" },
          { label: "معدل الرفض", value: `${stats?.completedReviews ? Math.round(((stats.rejectedCount || 0) / stats.completedReviews) * 100) : 0}%`, icon: XCircle, color: "text-red-500" },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-xs mb-1">{label}</p>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
              </div>
              <Icon className={`w-8 h-8 opacity-20 ${color}`} />
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <LayoutGrid size={18} className="text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-800">المشاريع النشطة</h2>
        <Badge variant="outline" className="text-xs">{(projectCounts as any[]).length} مشروع</Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (projectCounts as any[]).length === 0 ? (
        <Card className="p-10 text-center text-slate-400">
          <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مشاريع نشطة حالياً</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(projectCounts as any[]).map((project: any) => (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id, project.name)}
              className="group text-right bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1" />
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                    <Activity size={9} className="ml-1" /> نشط
                  </Badge>
                </div>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors mt-0.5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base mb-1 line-clamp-2">{project.name}</h3>
              {project.description && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-1">{project.description}</p>
              )}
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={11} />
                  <span>{project.pendingCount} معلق للمراجعة</span>
                </div>
                {project.pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                    {project.pendingCount > 99 ? "99+" : project.pendingCount}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QueueView({
  projectId,
  projectName,
  onBack,
  aiAssistVisible,
}: {
  projectId: number;
  projectName: string;
  onBack: () => void;
  aiAssistVisible: boolean;
}) {
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [pendingAction, setPendingAction] = useState<{ annotationId: number; type: "approve" | "reject" } | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { data: qaQueue = [], isLoading, refetch } = trpc.qa.getQueue.useQuery({ projectId });

  const approve = trpc.qa.approve.useMutation({
    onSuccess: () => { toast.success("✅ تم قبول التوسيم"); setPendingAction(null); setFeedbackText(""); setFocusedId(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reject = trpc.qa.reject.useMutation({
    onSuccess: () => { toast.success("❌ تم رفض التوسيم"); setPendingAction(null); setFeedbackText(""); setFocusedId(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const pendingItems = (qaQueue as any[]).filter(item => item.status === "pending_review");
  const pendingIds = pendingItems.map((i: any) => i.id);
  const isMutating = approve.isPending || reject.isPending;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!pendingItems.length) return;
    const currentIndex = focusedId ? pendingItems.findIndex((i: any) => i.id === focusedId) : -1;
    if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); const next = pendingItems[Math.min(currentIndex + 1, pendingItems.length - 1)]; if (next) setFocusedId(next.id); }
    else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); const prev = pendingItems[Math.max(currentIndex - 1, 0)]; if (prev) setFocusedId(prev.id); }
    else if ((e.key === "a" || e.key === "Enter") && focusedId) { e.preventDefault(); setPendingAction({ annotationId: focusedId, type: "approve" }); }
    else if ((e.key === "r" || e.key === "Delete") && focusedId) { e.preventDefault(); setPendingAction({ annotationId: focusedId, type: "reject" }); }
    else if (e.key === "?" || e.key === "/") { e.preventDefault(); setShowShortcuts(s => !s); }
    else if (e.key === "Escape") { setFocusedId(null); setPendingAction(null); }
  }, [focusedId, pendingItems]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!focusedId && pendingItems.length > 0) setFocusedId(pendingItems[0].id);
  }, [pendingItems.length]);

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAll() {
    if (selectedIds.size === pendingIds.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pendingIds));
  }
  async function batchApprove() {
    let done = 0;
    for (const id of [...selectedIds]) { try { await approve.mutateAsync({ annotationId: id }); done++; } catch {} }
    toast.success(`✅ تم قبول ${done} توسيم`);
    setSelectedIds(new Set()); setBatchMode(false);
  }
  async function batchReject() {
    let done = 0;
    for (const id of [...selectedIds]) { try { await reject.mutateAsync({ annotationId: id }); done++; } catch {} }
    toast.success(`❌ تم رفض ${done} توسيم`);
    setSelectedIds(new Set()); setBatchMode(false);
  }
  async function confirmAction() {
    if (!pendingAction) return;
    if (pendingAction.type === "approve") await approve.mutateAsync({ annotationId: pendingAction.annotationId, feedback: feedbackText || undefined });
    else await reject.mutateAsync({ annotationId: pendingAction.annotationId, feedback: feedbackText || undefined });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft size={16} />
          المشاريع
        </button>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-emerald-500" />
          <span className="font-semibold text-slate-800">{projectName}</span>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs mr-auto">
          {pendingItems.length} معلق
        </Badge>
        <Button variant="outline" size="sm" onClick={() => { setBatchMode(b => !b); setSelectedIds(new Set()); }}
          className={batchMode ? "bg-blue-50 border-blue-300 text-blue-700" : ""}>
          {batchMode ? "✓ وضع الدُفعات" : "تحديد متعدد"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowShortcuts(true)}>
          <Keyboard size={13} className="ml-1" /> اختصارات
        </Button>
      </div>

      {!batchMode && pendingItems.length > 0 && (
        <p className="text-xs text-slate-400 text-center mb-4">
          ⌨️ <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">J/K</kbd> للتنقل ·{" "}
          <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">A</kbd> قبول ·{" "}
          <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">R</kbd> رفض
        </p>
      )}

      {batchMode && selectedIds.size > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <span className="text-blue-700 text-sm font-medium">تم تحديد {selectedIds.size} توسيم</span>
          <div className="flex gap-2">
            <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={batchApprove} disabled={isMutating}>✅ قبول الكل</Button>
            <Button size="sm" variant="destructive" onClick={batchReject} disabled={isMutating}>❌ رفض الكل</Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>إلغاء</Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">قائمة المراجعة</h2>
            <p className="text-xs text-slate-400 mt-0.5">{pendingItems.length} معلق</p>
          </div>
          {batchMode && pendingIds.length > 0 && (
            <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
              {selectedIds.size === pendingIds.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
        ) : (qaQueue as any[]).length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400 opacity-40" />
            <p>لا توجد مراجعات معلقة في هذا المشروع</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(qaQueue as any[]).map((item: any) => {
              const isPending = item.status === "pending_review";
              const isFocused = focusedId === item.id && !batchMode;
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => batchMode ? toggleSelect(item.id) : setFocusedId(focusedId === item.id ? null : item.id)}
                  className={`p-5 transition-all cursor-pointer ${isFocused ? "bg-blue-50 border-r-4 border-blue-400" : ""} ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-start gap-3">
                    {batchMode && isPending && (
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 accent-blue-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-col gap-1">
                          <h3 className="font-semibold text-slate-900 text-sm">مهمة #{item.taskId || "—"}</h3>
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <User size={11} /> {item.taskerName || "موسِّم غير معروف"}
                          </span>
                        </div>
                        <Badge
                          variant={item.status === "approved" ? "default" : item.status === "rejected" ? "destructive" : "secondary"}
                          className="flex-shrink-0 text-xs"
                        >
                          {item.status === "approved" ? "✅ مقبول" : item.status === "rejected" ? "❌ مرفوض" : "⏳ معلق"}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded mb-2 line-clamp-3">
                        {item.taskContent || "محتوى المهمة غير متوفر"}
                      </p>
                      {item.result && (
                        <div className="bg-slate-100 rounded p-2 text-xs font-mono text-slate-600 line-clamp-2">
                          {JSON.stringify(item.result).slice(0, 150)}
                        </div>
                      )}
                      {isFocused && aiAssistVisible && (
                        <>
                          <AiReviewBadge annotationId={item.id} />
                          <SpamBadge annotationId={item.id} />
                        </>
                      )}
                      {isFocused && isPending && (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" className="bg-green-500 hover:bg-green-600 flex-1"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setPendingAction({ annotationId: item.id, type: "approve" }); }}>
                            ✅ قبول (A)
                          </Button>
                          <Button size="sm" variant="destructive" className="flex-1"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setPendingAction({ annotationId: item.id, type: "reject" }); }}>
                            ❌ رفض (R)
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={pendingAction !== null} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingAction?.type === "approve" ? "✅ تأكيد القبول" : "❌ تأكيد الرفض"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              <MessageSquare size={13} className="inline ml-1" />ملاحظات (اختياري)
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder="أضف ملاحظاتك..."
              value={feedbackText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFeedbackText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={isMutating}>إلغاء</Button>
            <Button
              variant={pendingAction?.type === "approve" ? "default" : "destructive"}
              onClick={confirmAction}
              disabled={isMutating}
              className={pendingAction?.type === "approve" ? "bg-green-500 hover:bg-green-600" : ""}
            >
              {isMutating ? "جارٍ..." : pendingAction?.type === "approve" ? "تأكيد القبول" : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>⌨️ اختصارات لوحة المفاتيح</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            {[
              ["J / ↓", "المهمة التالية"],
              ["K / ↑", "المهمة السابقة"],
              ["A / Enter", "قبول المهمة المحددة"],
              ["R / Delete", "رفض المهمة المحددة"],
              ["? / /", "فتح/إغلاق هذه القائمة"],
              ["Esc", "إلغاء التحديد"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">{desc}</span>
                <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono">{key}</kbd>
              </div>
            ))}
          </div>
          <DialogFooter><Button onClick={() => setShowShortcuts(false)}>حسناً</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function QADashboard() {
  const { user } = useAuth();
  const [selectedProject, setSelectedProject] = useState<{ id: number; name: string } | null>(null);
  const [aiAssistVisible, setAiAssistVisible] = useState(true);
  const { data: stats } = trpc.qa.getStats.useQuery();

  if (!user || (user.role !== "qa" && user.role !== "admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">غير مصرح لك بالوصول</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">مرحباً {user.name}</h1>
              <p className="text-slate-500 text-sm mt-0.5">لوحة مراجع الجودة — QA Review</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={aiAssistVisible ? "default" : "outline"}
                size="sm"
                onClick={() => setAiAssistVisible(v => !v)}
                className={aiAssistVisible ? "bg-violet-600 hover:bg-violet-700" : ""}
              >
                <Bot size={14} className="ml-1" />
                {aiAssistVisible ? "AI مفعّل" : "AI معطّل"}
              </Button>
              <Badge className="bg-red-100 text-red-800">مراجع جودة</Badge>
            </div>
          </div>
        </div>
      </div>

      {selectedProject ? (
        <QueueView
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          onBack={() => setSelectedProject(null)}
          aiAssistVisible={aiAssistVisible}
        />
      ) : (
        <ProjectsView
          onSelectProject={(id, name) => setSelectedProject({ id, name })}
          stats={stats}
        />
      )}
    </div>
  );
}
