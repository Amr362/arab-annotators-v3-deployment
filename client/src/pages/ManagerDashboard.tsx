/**
 * ManagerDashboard — v4
 * ──────────────────────
 * Full management interface for role=manager (and admin).
 * Tabs:
 *   1. Overview      — project progress, throughput, IAA, QA pass rate
 *   2. QA Queue      — review SUBMITTED/IN_QA tasks with approve/reject/edit
 *   3. Team          — assign workers, set skill levels, unsuspend
 *   4. Batches       — create and view batches with HP/QA rates
 *   5. IAA           — Cohen's κ and Fleiss' κ charts
 */

import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard, ClipboardCheck, Users, Layers, BarChart2,
  CheckCircle2, XCircle, Clock, TrendingUp, AlertTriangle,
  RefreshCw, UserX, UserCheck, Star, ChevronRight, Pencil, Plus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Colours ─────────────────────────────────────────────────────────────────
const KAPPA_COLOR = "#6366f1";
const PASS_COLOR = "#22c55e";
const FAIL_COLOR = "#ef4444";
const HP_COLOR = "#f59e0b";
const SKILL_COLORS = ["#e5e7eb", "#bfdbfe", "#93c5fd", "#3b82f6", "#1d4ed8"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const kappaLabel = (k: number | null) => {
  if (k === null) return "—";
  if (k >= 0.8) return "ممتاز";
  if (k >= 0.6) return "جيد";
  if (k >= 0.4) return "مقبول";
  return "ضعيف";
};
const kappaColor = (k: number | null) => {
  if (k === null) return "text-gray-400";
  if (k >= 0.8) return "text-green-600";
  if (k >= 0.6) return "text-blue-600";
  if (k >= 0.4) return "text-yellow-600";
  return "text-red-600";
};
const pct = (n: number) => `${Math.round(n * 100)}%`;
const statusBadge: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  paused:    "bg-yellow-100 text-yellow-700",
  completed: "bg-gray-100 text-gray-600",
};

// ─── Tab labels ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "نظرة عامة",     icon: LayoutDashboard },
  { id: "qa",       label: "قائمة المراجعة", icon: ClipboardCheck },
  { id: "team",     label: "الفريق",         icon: Users },
  { id: "batches",  label: "الدُّفعات",      icon: Layers },
  { id: "iaa",      label: "اتفاقية IAA",    icon: BarChart2 },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const [tab, setTab] = useState<TabId>("overview");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: projects = [], isLoading: loadingProjects } =
    trpc.manager.getProjects.useQuery();

  const projectId = selectedProjectId ?? projects[0]?.id ?? 0;

  return (
    <ArabAnnotatorsDashboardLayout>
      <div className="min-h-screen bg-gray-50 font-sans" dir="rtl">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">لوحة المدير</h1>
            <p className="text-sm text-gray-500">إدارة المشاريع والفريق والجودة</p>
          </div>
          <Select
            value={String(projectId)}
            onValueChange={v => setSelectedProjectId(Number(v))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="اختر مشروعاً" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${p.status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ─────────────────────────────────────────── */}
        <div className="p-6">
          {!projectId ? (
            <EmptyState />
          ) : (
            <>
              {tab === "overview" && <OverviewTab projectId={projectId} />}
              {tab === "qa"       && <QATab projectId={projectId} />}
              {tab === "team"     && <TeamTab projectId={projectId} />}
              {tab === "batches"  && <BatchesTab projectId={projectId} />}
              {tab === "iaa"      && <IAATab projectId={projectId} />}
            </>
          )}
        </div>
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
      <LayoutDashboard className="w-12 h-12" />
      <p className="text-lg">لا توجد مشاريع — اطلب من المدير الأعلى تعيينك في مشروع</p>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ projectId }: { projectId: number }) {
  const { data, isLoading, refetch } = trpc.manager.getDashboard.useQuery({ projectId });

  const recompute = trpc.manager.recomputeMetrics.useMutation({
    onSuccess: () => { toast.success("تم إعادة الحساب"); refetch(); },
  });

  if (isLoading) return <Spinner />;
  if (!data) return null;

  const { progress, progressPct, throughput24h, leaderboard, qa, iaa } = data;

  const donutData = [
    { name: "مكتمل", value: progress.approved, fill: PASS_COLOR },
    { name: "مراجعة", value: progress.inQa, fill: KAPPA_COLOR },
    { name: "مُسلَّم", value: progress.submitted, fill: "#a5b4fc" },
    { name: "قيد العمل", value: progress.inProgress, fill: "#fbbf24" },
    { name: "متاح", value: progress.created, fill: "#e5e7eb" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<TrendingUp className="text-indigo-500" />}
          label="الإنجاز الكلي" value={`${progressPct}%`} sub={`${progress.approved} / ${progress.total}`} />
        <KPICard icon={<CheckCircle2 className="text-green-500" />}
          label="إنتاج اليوم" value={String(throughput24h)} sub="تسليم في ٢٤ ساعة" />
        <KPICard icon={<ClipboardCheck className="text-blue-500" />}
          label="QA – نسبة القبول" value={pct(qa.passRate)} sub={`${qa.approved} / ${qa.total}`} />
        <KPICard icon={<BarChart2 className="text-violet-500" />}
          label="IAA – Fleiss κ"
          value={iaa?.fleissKappa != null ? Number(iaa.fleissKappa).toFixed(3) : "—"}
          sub={kappaLabel(iaa?.fleissKappa ? Number(iaa.fleissKappa) : null)} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">توزيع حالات المهام</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Legend iconType="circle" iconSize={10} />
                <Tooltip formatter={(v: number) => [`${v} مهمة`]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">أفضل المُوسِّمين</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {leaderboard.slice(0, 10).map((w, i) => (
                <div key={w.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-5 text-center font-bold">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{w.name}</span>
                      {w.isSuspended && <Badge className="bg-red-100 text-red-700 text-xs">موقوف</Badge>}
                    </div>
                    <div className="text-xs text-gray-400">{w.totalAnnotations} تسليم · QA {pct(w.qaPassRate)}</div>
                  </div>
                  <SkillBadge level={w.skillLevel} />
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-sm text-gray-400 text-center py-4">لا توجد بيانات بعد</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => recompute.mutate()}
          disabled={recompute.isPending}>
          <RefreshCw className={`w-4 h-4 ml-1 ${recompute.isPending ? "animate-spin" : ""}`} />
          إعادة حساب المقاييس
        </Button>
      </div>
    </div>
  );
}

// ─── QA Tab ──────────────────────────────────────────────────────────────────
function QATab({ projectId }: { projectId: number }) {
  const [page, setPage] = useState(0);
  const PAGE = 20;
  const [editing, setEditing] = useState<null | { taskId: number; annId: number; result: string }>(null);
  const [feedback, setFeedback] = useState("");

  const { data, isLoading, refetch } = trpc.manager.getQAQueue.useQuery(
    { projectId, limit: PAGE, offset: page * PAGE },
    { refetchInterval: 30_000 }
  );

  const approve = trpc.manager.qaApprove.useMutation({
    onSuccess: () => { toast.success("تمت الموافقة"); refetch(); },
  });
  const reject = trpc.manager.qaReject.useMutation({
    onSuccess: () => { toast.success("تم الرفض"); refetch(); setFeedback(""); },
    onError: e => toast.error(e.message),
  });
  const editApprove = trpc.manager.qaEditAndApprove.useMutation({
    onSuccess: () => { toast.success("تم التعديل والقبول"); setEditing(null); refetch(); },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          قائمة المراجعة
          <Badge className="mr-2 bg-indigo-100 text-indigo-700">{data?.total ?? 0}</Badge>
        </h2>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 ml-1" /> تحديث
        </Button>
      </div>

      {data?.items.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p>لا توجد مهام في قائمة المراجعة الآن 🎉</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.items.map(item => (
          <Card key={item.taskId} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  {item.isHoneyPot && (
                    <Badge className="mb-1 bg-amber-100 text-amber-700 text-xs">🍯 Honey Pot</Badge>
                  )}
                  <p className="text-sm text-gray-700 line-clamp-3">{item.content}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>👤 {item.annotatorName}</span>
                    <span>⭐ مستوى {item.annotatorSkill}</span>
                    {item.annTimeSpent ? <span>⏱ {Math.round(item.annTimeSpent / 60)} دقيقة</span> : null}
                  </div>
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 font-mono">
                    {JSON.stringify(item.annResult, null, 2)}
                  </div>
                  {item.aiSuggestion && (
                    <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-blue-700">
                      🤖 اقتراح AI: {JSON.stringify(item.aiSuggestion)}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => approve.mutate({ taskId: item.taskId, annotationId: item.annId })}
                    disabled={approve.isPending}>
                    <CheckCircle2 className="w-4 h-4 ml-1" /> قبول
                  </Button>

                  <Button size="sm" variant="outline"
                    className="border-blue-300 text-blue-600"
                    onClick={() => setEditing({
                      taskId: item.taskId, annId: item.annId,
                      result: JSON.stringify(item.annResult, null, 2),
                    })}>
                    <Pencil className="w-4 h-4 ml-1" /> تعديل
                  </Button>

                  <div className="flex gap-1">
                    <Input
                      placeholder="ملاحظة الرفض..."
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      className="text-xs h-8 w-32"
                    />
                    <Button size="sm" variant="destructive"
                      onClick={() => reject.mutate({
                        taskId: item.taskId, annotationId: item.annId, feedback,
                      })}
                      disabled={!feedback || reject.isPending}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {(data?.total ?? 0) > PAGE && (
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</Button>
          <span className="text-sm text-gray-500 self-center">صفحة {page + 1}</span>
          <Button variant="outline" size="sm"
            disabled={(page + 1) * PAGE >= (data?.total ?? 0)}
            onClick={() => setPage(p => p + 1)}>التالي</Button>
        </div>
      )}

      {/* Edit dialog */}
      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>تعديل النتيجة والقبول</DialogTitle></DialogHeader>
            <textarea
              className="w-full border rounded p-2 text-sm font-mono h-40 resize-none"
              value={editing.result}
              onChange={e => setEditing({ ...editing, result: e.target.value })}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(editing.result);
                    editApprove.mutate({ taskId: editing.taskId, annotationId: editing.annId, correctedResult: parsed });
                  } catch { toast.error("JSON غير صالح"); }
                }}>
                حفظ وقبول
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────
function TeamTab({ projectId }: { projectId: number }) {
  const { data: team = [], isLoading: loadingTeam, refetch } = trpc.manager.getTeam.useQuery({ projectId });
  const { data: available = [] } = trpc.manager.getAvailableWorkers.useQuery();
  const { data: metrics = [] } = trpc.manager.getWorkerMetrics.useQuery({ projectId });
  const [assignId, setAssignId] = useState("");
  const [assignRole, setAssignRole] = useState<"tasker" | "qa">("tasker");

  const assign = trpc.manager.assignWorker.useMutation({
    onSuccess: () => { toast.success("تم التعيين"); refetch(); setAssignId(""); },
  });
  const remove = trpc.manager.removeWorker.useMutation({
    onSuccess: () => { toast.success("تم الإزالة"); refetch(); },
  });
  const setSkill = trpc.manager.setWorkerSkillLevel.useMutation({
    onSuccess: () => toast.success("تم تحديث المستوى"),
  });
  const unsuspend = trpc.manager.unsuspendWorker.useMutation({
    onSuccess: () => { toast.success("تم رفع الإيقاف"); refetch(); },
  });

  const metricsByUser = Object.fromEntries(metrics.map(m => [m.userId, m]));

  if (loadingTeam) return <Spinner />;

  const unassigned = available.filter(u => !team.some(t => t.userId === u.id));

  return (
    <div className="space-y-6">
      {/* Assign new worker */}
      <Card>
        <CardHeader><CardTitle className="text-sm">تعيين موسِّم جديد</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <Select value={assignId} onValueChange={setAssignId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="اختر مستخدماً" />
            </SelectTrigger>
            <SelectContent>
              {unassigned.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name ?? `#${u.id}`} — {u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignRole} onValueChange={v => setAssignRole(v as "tasker" | "qa")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tasker">موسِّم</SelectItem>
              <SelectItem value="qa">مراجع QA</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => assign.mutate({ projectId, userId: Number(assignId), role: assignRole })}
            disabled={!assignId || assign.isPending}>
            <Plus className="w-4 h-4 ml-1" /> تعيين
          </Button>
        </CardContent>
      </Card>

      {/* Team table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">الفريق الحالي ({team.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {team.map(member => {
              const m = metricsByUser[member.userId];
              const isSuspended = member.user?.isSuspended;
              return (
                <div key={member.id} className="flex items-center gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{member.user?.name ?? `#${member.userId}`}</span>
                      <Badge className={member.role === "qa" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}>
                        {member.role === "qa" ? "مراجع" : "موسِّم"}
                      </Badge>
                      {isSuspended && <Badge className="bg-red-100 text-red-700">موقوف</Badge>}
                    </div>
                    {m && (
                      <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                        <span>{m.totalAnnotations} تسليم</span>
                        <span>QA {pct(Number(m.qaPassRate))}</span>
                        <span>HP {pct(Number(m.honeyPotAccuracy))}</span>
                      </div>
                    )}
                  </div>

                  {/* Skill level picker */}
                  <Select
                    value={String(member.user?.skillLevel ?? 1)}
                    onValueChange={v => setSkill.mutate({ userId: member.userId, skillLevel: Number(v) })}
                  >
                    <SelectTrigger className="w-24 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(l => (
                        <SelectItem key={l} value={String(l)}>مستوى {l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    {isSuspended && (
                      <Button size="sm" variant="outline" className="text-green-600 border-green-300"
                        onClick={() => unsuspend.mutate({ userId: member.userId })}>
                        <UserCheck className="w-3.5 h-3.5 ml-1" /> رفع الإيقاف
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-500"
                      onClick={() => remove.mutate({ projectId, userId: member.userId })}>
                      <UserX className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {team.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">لا يوجد أعضاء في الفريق بعد</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Batches Tab ──────────────────────────────────────────────────────────────
function BatchesTab({ projectId }: { projectId: number }) {
  const { data: batchList = [], isLoading, refetch } = trpc.manager.getBatches.useQuery({ projectId });
  const [name, setName] = useState("");
  const [hpRate, setHpRate] = useState("0.05");
  const [qaRate, setQaRate] = useState("0.20");

  const create = trpc.manager.createBatch.useMutation({
    onSuccess: () => { toast.success("تم إنشاء الدُّفعة"); refetch(); setName(""); },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">إنشاء دُفعة جديدة</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Input placeholder="اسم الدُّفعة" value={name} onChange={e => setName(e.target.value)} className="w-48" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">نسبة Honey Pot</label>
              <Input type="number" min="0" max="0.5" step="0.01"
                value={hpRate} onChange={e => setHpRate(e.target.value)} className="w-24" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">نسبة QA</label>
              <Input type="number" min="0" max="1" step="0.05"
                value={qaRate} onChange={e => setQaRate(e.target.value)} className="w-24" />
            </div>
            <Button onClick={() => create.mutate({
              projectId, name, honeyPotRate: Number(hpRate), qaRate: Number(qaRate),
            })} disabled={!name || create.isPending}>
              <Plus className="w-4 h-4 ml-1" /> إنشاء
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {batchList.map(b => (
          <Card key={b.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{b.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(b.createdAt).toLocaleDateString("ar")}</p>
                </div>
                <Badge className={b.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                  {b.status === "active" ? "نشط" : "معلق"}
                </Badge>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  HP: {pct(Number(b.honeyPotRate))}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  QA: {pct(Number(b.qaRate))}
                </span>
                <span>{b.taskCount} مهمة</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {batchList.length === 0 && (
          <p className="text-sm text-gray-400 col-span-3 text-center py-8">لا توجد دُفعات بعد</p>
        )}
      </div>
    </div>
  );
}

// ─── IAA Tab ──────────────────────────────────────────────────────────────────
function IAATab({ projectId }: { projectId: number }) {
  const { data: scores = [], isLoading, refetch } = trpc.manager.getIAAScores.useQuery({ projectId });
  const trigger = trpc.manager.triggerIAACompute.useMutation({
    onSuccess: () => { toast.success("تم إعادة حساب IAA"); refetch(); },
  });

  const pairwiseScores = scores.filter(s => s.annotator1Id && s.annotator2Id);
  const fleissScore = scores.find(s => !s.annotator1Id && s.fleissKappa);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">اتفاقية المُوسِّمين (IAA)</h2>
          <p className="text-xs text-gray-500">κ ≥ 0.8 ممتاز · 0.6–0.8 جيد · 0.4–0.6 مقبول · أقل ضعيف</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => trigger.mutate({ projectId })}
          disabled={trigger.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 ml-1 ${trigger.isPending ? "animate-spin" : ""}`} />
          إعادة الحساب
        </Button>
      </div>

      {/* Fleiss κ big number */}
      {fleissScore && (
        <Card className="bg-gradient-to-l from-indigo-50 to-white">
          <CardContent className="p-6 flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Fleiss' κ (المشروع كاملاً)</p>
              <p className={`text-4xl font-bold ${kappaColor(Number(fleissScore.fleissKappa))}`}>
                {Number(fleissScore.fleissKappa).toFixed(3)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{kappaLabel(Number(fleissScore.fleissKappa))}</p>
            </div>
            <div className="text-xs text-gray-400">
              <p>{fleissScore.taskCount} مهمة مشتركة</p>
              <p>آخر تحديث: {new Date(fleissScore.computedAt).toLocaleString("ar")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pairwise chart */}
      {pairwiseScores.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Cohen's κ — الأزواج</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pairwiseScores.map(s => ({
                pair: `${s.annotator1Id}↔${s.annotator2Id}`,
                kappa: Number(s.kappaCohens ?? 0),
                pct: Number(s.agreementPct ?? 0),
              }))}>
                <XAxis dataKey="pair" tick={{ fontSize: 10 }} />
                <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, n: string) => [v.toFixed(3), n === "kappa" ? "κ" : "اتفاق %"]} />
                <Bar dataKey="kappa" name="Cohen κ" fill={KAPPA_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {pairwiseScores.length === 0 && !fleissScore && (
        <div className="text-center py-12 text-gray-400">
          <BarChart2 className="w-10 h-10 mx-auto mb-2" />
          <p>لا توجد بيانات IAA بعد — يحتاج المشروع لمهام مُوسَّمة من أكثر من موسِّم</p>
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">{icon}</div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs font-medium text-gray-700">{label}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillBadge({ level }: { level: number }) {
  const colors = ["", "bg-gray-100 text-gray-600", "bg-blue-100 text-blue-600",
    "bg-green-100 text-green-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700"];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[level] ?? colors[1]}`}>
      ★ {level}
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}
