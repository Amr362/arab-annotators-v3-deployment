import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, XCircle, TrendingUp, MessageSquare, Keyboard, Bot, ShieldAlert, User, Folder, Activity } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

// ── AI Review Badge component ─────────────────────────────────────────────────
function AiReviewBadge({ annotationId }: { annotationId: number }) {
  const { data, isLoading } = trpc.aiTools.qaReview.useQuery({ annotationId }, { retry: false });
  if (isLoading) return <span className="text-xs text-slate-400 animate-pulse">🤖 AI يحلل...</span>;
  if (!data) return null;
  const color = data.verdict === "approve" ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : data.verdict === "reject" ? "text-red-600 bg-red-50 border-red-200"
    : "text-amber-600 bg-amber-50 border-amber-200";
  const icon = data.verdict === "approve" ? "✅" : data.verdict === "reject" ? "❌" : "⚠️";
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${color} mt-2`}>
      <Bot size={12} className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-semibold">{icon} AI: {data.verdict === "approve" ? "يُوصي بالقبول" : data.verdict === "reject" ? "يُوصي بالرفض" : "غير محدد"}</span>
        <span className="opacity-70 mr-1">({data.confidence}% ثقة)</span>
        {data.reason && <p className="opacity-80 mt-0.5">{data.reason}</p>}
      </div>
    </div>
  );
}

// ── Spam Badge component ──────────────────────────────────────────────────────
function SpamBadge({ annotationId }: { annotationId: number }) {
  const { data, isLoading } = trpc.aiTools.spamCheck.useQuery({ annotationId }, { retry: false });
  if (isLoading || !data) return null;
  if (!data.isSpam) return null;
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

export default function QADashboard() {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [pendingAction, setPendingAction] = useState<{ annotationId: number; type: "approve" | "reject" } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [batchMode, setBatchMode] = useState(false);

  const [aiAssistVisible, setAiAssistVisible] = useState(true);
  const { data: qaQueue, isLoading, refetch } = trpc.qa.getQueue.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.qa.getStats.useQuery();
  const { data: allProjects } = trpc.projects.getAll.useQuery();

  const projectCounts = useMemo(() => ({
    active: allProjects?.filter(p => p.status === "active").length ?? 0,
    paused: allProjects?.filter(p => p.status === "paused").length ?? 0,
    completed: allProjects?.filter(p => p.status === "completed").length ?? 0,
  }), [allProjects]);

  const approve = trpc.qa.approve.useMutation({
    onSuccess: () => { toast.success("✅ تم قبول التوسيم"); setPendingAction(null); setFeedbackText(""); setFocusedId(null); refetch(); refetchStats(); },
    onError: e => toast.error(e.message),
  });
  const reject = trpc.qa.reject.useMutation({
    onSuccess: () => { toast.success("❌ تم رفض التوسيم"); setPendingAction(null); setFeedbackText(""); setFocusedId(null); refetch(); refetchStats(); },
    onError: e => toast.error(e.message),
  });

  const pendingItems = (qaQueue ?? []).filter((item: any) => item.status === "pending_review");
  const pendingIds = pendingItems.map((i: any) => i.id);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const pending = (qaQueue ?? []).filter((i: any) => i.status === "pending_review");
    if (!pending.length) return;

    const currentIndex = focusedId ? pending.findIndex((i: any) => i.id === focusedId) : -1;

    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = pending[Math.min(currentIndex + 1, pending.length - 1)];
      if (next) setFocusedId(next.id);
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = pending[Math.max(currentIndex - 1, 0)];
      if (prev) setFocusedId(prev.id);
    } else if ((e.key === "a" || e.key === "Enter") && focusedId) {
      e.preventDefault();
      setPendingAction({ annotationId: focusedId, type: "approve" });
    } else if ((e.key === "r" || e.key === "Delete") && focusedId) {
      e.preventDefault();
      setPendingAction({ annotationId: focusedId, type: "reject" });
    } else if (e.key === "?" || e.key === "/") {
      e.preventDefault();
      setShowShortcuts(s => !s);
    } else if (e.key === "Escape") {
      setFocusedId(null);
      setPendingAction(null);
    }
  }, [focusedId, qaQueue]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-focus first item
  useEffect(() => {
    if (!focusedId && pendingItems.length > 0) setFocusedId(pendingItems[0].id);
  }, [pendingItems.length]);

  // ── Batch actions ──────────────────────────────────────────────────────────────
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selectedIds.size === pendingIds.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pendingIds));
  }
  async function batchApprove() {
    const ids = [...selectedIds];
    let done = 0;
    for (const id of ids) {
      try { await approve.mutateAsync({ annotationId: id }); done++; } catch {}
    }
    toast.success(`✅ تم قبول ${done} توسيم`);
    setSelectedIds(new Set());
    setBatchMode(false);
  }
  async function batchReject() {
    const ids = [...selectedIds];
    let done = 0;
    for (const id of ids) {
      try { await reject.mutateAsync({ annotationId: id }); done++; } catch {}
    }
    toast.success(`❌ تم رفض ${done} توسيم`);
    setSelectedIds(new Set());
    setBatchMode(false);
  }

  async function confirmAction() {
    if (!pendingAction) return;
    if (pendingAction.type === "approve") await approve.mutateAsync({ annotationId: pendingAction.annotationId, feedback: feedbackText || undefined });
    else await reject.mutateAsync({ annotationId: pendingAction.annotationId, feedback: feedbackText || undefined });
  }

  if (!user || (user.role !== "qa" && user.role !== "admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center"><AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" /><p className="text-lg font-semibold">غير مصرح لك بالوصول</p></div>
      </div>
    );
  }

  const isMutating = approve.isPending || reject.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">مرحباً {user.name}</h1>
              <p className="text-slate-500 text-sm mt-0.5">لوحة مراجع الجودة — QA Review</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowShortcuts(true)} className="flex items-center gap-1.5">
                <Keyboard size={14} />اختصارات لوحة المفاتيح
              </Button>
              <Button
                variant={aiAssistVisible ? "default" : "outline"}
                size="sm"
                onClick={() => setAiAssistVisible(v => !v)}
                className={aiAssistVisible ? "bg-violet-600 hover:bg-violet-700" : ""}
              >
                <Bot size={14} className="ml-1" />
                {aiAssistVisible ? "AI مفعّل" : "AI معطّل"}
              </Button>
              <Button
                variant={batchMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setBatchMode(b => !b); setSelectedIds(new Set()); }}
                className={batchMode ? "bg-blue-600" : ""}
              >
                {batchMode ? "✓ وضع الدُفعات" : "تحديد متعدد"}
              </Button>
              <Badge className="bg-red-100 text-red-800">مراجع جودة</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard hint */}
      {!batchMode && pendingItems.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3">
          <p className="text-xs text-slate-400 text-center">
            ⌨️ اضغط <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">J/K</kbd> للتنقل · <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">A</kbd> قبول · <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">R</kbd> رفض · <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">?</kbd> مساعدة
          </p>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "معلقة", value: stats?.pendingReviews ?? 0, icon: AlertCircle, color: "text-yellow-500" },
            { label: "مكتملة", value: stats?.completedReviews ?? 0, icon: CheckCircle2, color: "text-green-500" },
            { label: "معدل القبول", value: `${stats?.agreementRate ?? 0}%`, icon: TrendingUp, color: "text-blue-500" },
            { label: "معدل الرفض", value: `${stats?.completedReviews ? Math.round(((stats.rejectedCount || 0) / stats.completedReviews) * 100) : 0}%`, icon: XCircle, color: "text-red-500" },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between">
                <div><p className="text-slate-500 text-xs mb-1">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div>
                <Icon className={`w-8 h-8 opacity-20 ${color}`} />
              </div>
            </Card>
          ))}
        </div>

        {/* Projects Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "مشاريع نشطة", val: projectCounts.active, bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
            { label: "موقوفة مؤقتاً", val: projectCounts.paused, bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-400" },
            { label: "مكتملة", val: projectCounts.completed, bg: "bg-blue-50 border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
          ].map((s, i) => (
            <div key={i} className={`rounded-xl border p-4 flex items-center gap-3 ${s.bg}`}>
              <span className={`w-3 h-3 rounded-full ${s.dot}`} />
              <div>
                <p className={`text-2xl font-bold ${s.text}`}>{s.val}</p>
                <p className={`text-xs ${s.text} opacity-80`}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Batch actions bar */}
        {batchMode && selectedIds.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <span className="text-blue-700 text-sm font-medium">تم تحديد {selectedIds.size} توسيم</span>
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={batchApprove} disabled={isMutating}>✅ قبول الكل</Button>
              <Button size="sm" variant="destructive" onClick={batchReject} disabled={isMutating}>❌ رفض الكل</Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
            </div>
          </div>
        )}

        {/* Queue */}
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
          ) : qaQueue && qaQueue.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {qaQueue.map((item: any) => {
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
                          onClick={e => e.stopPropagation()}
                          className="mt-1 w-4 h-4 accent-blue-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex flex-col gap-1">
                            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                              مهمة #{item.taskId}
                              {item.projectStatus === "active" && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-5 px-1.5">
                                  <Activity size={10} className="ml-1" /> نشط
                                </Badge>
                              )}
                            </h3>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1"><Folder size={12} /> {item.projectName}</span>
                              <span className="flex items-center gap-1"><User size={12} /> {item.taskerName}</span>
                            </div>
                          </div>
                          <Badge variant={item.status === "approved" ? "default" : item.status === "rejected" ? "destructive" : "secondary"} className="flex-shrink-0 text-xs">
                            {item.status === "approved" ? "✅ مقبول" : item.status === "rejected" ? "❌ مرفوض" : "⏳ معلق"}
                          </Badge>
                        </div>
                        {item.taskContent && (
                          <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded mb-2 line-clamp-3">{item.taskContent}</p>
                        )}
                        {item.result && (
                          <div className="bg-slate-100 rounded p-2 text-xs font-mono text-slate-600 line-clamp-2">
                            {JSON.stringify(item.result).slice(0, 150)}
                          </div>
                        )}
                        {/* AI Review & Spam badges */}
                        {isFocused && aiAssistVisible && (
                          <>
                            <AiReviewBadge annotationId={item.id} />
                            <SpamBadge annotationId={item.id} />
                          </>
                        )}
                        {/* Action buttons when focused */}
                        {isFocused && isPending && (
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" className="bg-green-500 hover:bg-green-600 flex-1"
                              onClick={e => { e.stopPropagation(); setPendingAction({ annotationId: item.id, type: "approve" }); }}>
                              ✅ قبول (A)
                            </Button>
                            <Button size="sm" variant="destructive" className="flex-1"
                              onClick={e => { e.stopPropagation(); setPendingAction({ annotationId: item.id, type: "reject" }); }}>
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
          ) : (
            <div className="p-10 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400 opacity-40" />
              <p>لا توجد مراجعات معلقة</p>
            </div>
          )}
        </Card>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={pendingAction !== null} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingAction?.type === "approve" ? "✅ تأكيد القبول" : "❌ تأكيد الرفض"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-slate-700 mb-2 block"><MessageSquare size={13} className="inline ml-1" />ملاحظات (اختياري)</label>
            <textarea className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" rows={3}
              placeholder="أضف ملاحظاتك..." value={feedbackText} onChange={e => setFeedbackText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={isMutating}>إلغاء</Button>
            <Button variant={pendingAction?.type === "approve" ? "default" : "destructive"}
              onClick={confirmAction} disabled={isMutating}
              className={pendingAction?.type === "approve" ? "bg-green-500 hover:bg-green-600" : ""}>
              {isMutating ? "جارٍ..." : pendingAction?.type === "approve" ? "تأكيد القبول" : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcuts Dialog */}
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
