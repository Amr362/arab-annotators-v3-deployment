import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, FileText, CheckCircle2, TrendingUp, Trophy,
  UserCheck, UserX, Pencil, Trash2, Plus, RefreshCw,
  ClipboardList, BarChart3, ShieldCheck, XCircle, Folder,
  Activity, Filter, ChevronDown,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type Role = "admin" | "manager" | "tasker" | "qa" | "user";

const roleLabel: Record<Role, string> = {
  admin: "مدير النظام",
  manager: "مدير",
  tasker: "موسِّم",
  qa: "مراجع جودة",
  user: "مستخدم",
};

const roleBadgeColor: Record<Role, string> = {
  admin:   "bg-red-100 text-red-700",
  manager: "bg-purple-100 text-purple-700",
  tasker:  "bg-amber-100 text-amber-700",
  qa:      "bg-blue-100 text-blue-700",
  user:    "bg-gray-100 text-gray-700",
};

const TABS = [
  { id: "overview",    label: "📊 الإحصائيات"     },
  { id: "assign",      label: "🎯 تعيين المهام"    },
  { id: "qa",          label: "📋 تقارير الجودة"   },
  { id: "qadecisions", label: "✅ قرارات QA"        },
  { id: "team",        label: "👥 إدارة الفريق"    },
] as const;
type Tab = typeof TABS[number]["id"];

const PIE_COLORS = ["#10B981", "#EF4444", "#F59E0B"];

export default function ManagerDashboard() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // ─── Assign state ────────────────────────────────────────────────────────────
  const [assignProjectId, setAssignProjectId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId]       = useState<number | null>(null);
  const [assignCount, setAssignCount]         = useState(10);

  // ─── Edit user dialog ────────────────────────────────────────────────────────
  const [showEditDialog,   setShowEditDialog]   = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    id: 0, name: "", email: "", role: "tasker" as Role, isActive: true,
  });
  const [createForm, setCreateForm] = useState({
    name: "", email: "", password: "", role: "tasker" as Role,
  });

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: stats }        = trpc.adminStats.get.useQuery();
  const { data: users = [] }   = trpc.admin.getAllUsers.useQuery();
  const { data: leaderboard }  = trpc.leaderboard.get.useQuery();
  const { data: allProjects }  = trpc.projects.getAll.useQuery();
  const { data: unassigned, refetch: refetchUnassigned } = trpc.taskManagement.getUnassigned.useQuery(
    { projectId: assignProjectId ?? 0 },
    { enabled: !!assignProjectId },
  );

  // ─── QA Decisions (manager review feed) ─────────────────────────────────────
  const [qaDecisionsProjectId, setQaDecisionsProjectId] = useState<number | null>(null);
  const { data: qaDecisions = [], isLoading: qaDecisionsLoading } =
    trpc.managerReview.getQADecisions.useQuery(
      qaDecisionsProjectId ? { projectId: qaDecisionsProjectId } : {},
    );
  const { data: projectSummary = [] } = trpc.managerReview.getProjectSummary.useQuery();

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const assignTasks = trpc.taskManagement.assignTasks.useMutation({
    onSuccess: (res: any) => {
      toast.success(`تم تعيين ${res?.assigned ?? assignCount} مهمة بنجاح`);
      refetchUnassigned();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث المستخدم");
      setShowEditDialog(false);
      queryClient.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء المستخدم");
      setShowCreateDialog(false);
      setCreateForm({ name: "", email: "", password: "", role: "tasker" });
      queryClient.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المستخدم");
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Computed ─────────────────────────────────────────────────────────────────
  const taskers = useMemo(() => users.filter((u: any) => u.role === "tasker" && u.isActive), [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u: any) => {
      const matchesRole   = roleFilter === "all" || u.role === roleFilter;
      const matchesSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, search]);

  const pieData = [
    { name: "مقبولة",        value: stats?.approvedAnnotations  ?? 0 },
    { name: "مرفوضة",        value: stats?.rejectedAnnotations  ?? 0 },
    { name: "قيد المراجعة",  value: stats?.submittedAnnotations ?? 0 },
  ];

  // ─── Handlers ────────────────────────────────────────────────────────────────
  function openEdit(u: any) {
    setEditForm({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive ?? true });
    setShowEditDialog(true);
  }

  function handleAssign() {
    if (!assignProjectId || !assignUserId) {
      toast.error("اختر المشروع والموسِّم أولاً");
      return;
    }
    const ids = (unassigned ?? []).slice(0, assignCount).map((t: any) => t.id);
    if (!ids.length) { toast.error("لا توجد مهام غير مُعيَّنة"); return; }
    assignTasks.mutate({ taskIds: ids, userId: assignUserId });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <ArabAnnotatorsDashboardLayout title="لوحة المدير">
      <div className="p-6 space-y-6" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">لوحة المدير</h1>
            <p className="text-slate-500 text-sm mt-1">إدارة الفريق والمشاريع ومتابعة الجودة</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === t.id
                  ? "bg-white border border-b-white border-slate-200 text-primary -mb-px"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: الإحصائيات ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "إجمالي المستخدمين", value: stats?.totalUsers        ?? 0, icon: Users,        color: "text-blue-600 bg-blue-50"   },
                { label: "المشاريع",           value: stats?.totalProjects      ?? 0, icon: FileText,     color: "text-green-600 bg-green-50" },
                { label: "توسيمات اليوم",      value: stats?.todayAnnotations   ?? 0, icon: TrendingUp,   color: "text-amber-600 bg-amber-50" },
                { label: "مقبولة إجمالاً",     value: stats?.approvedAnnotations ?? 0, icon: CheckCircle2, color: "text-purple-600 bg-purple-50" },
              ].map(card => (
                <Card key={card.label}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.color}`}>
                      <card.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-800">{card.value.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">{card.label}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-sm">توزيع حالة التوسيمات</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">🏆 أفضل الموسِّمين</CardTitle></CardHeader>
                <CardContent>
                  {!leaderboard?.length ? (
                    <p className="text-slate-400 text-sm text-center py-8">لا توجد بيانات بعد</p>
                  ) : (
                    <div className="space-y-2">
                      {leaderboard.slice(0, 8).map((u: any, i: number) => (
                        <div key={u.userId} className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                            {i + 1}
                          </span>
                          <span className="flex-1 text-sm text-slate-700 truncate">{u.name}</span>
                          <span className="text-xs text-slate-500">{u.totalSubmitted} توسيم</span>
                          <span className={`text-xs font-semibold ${u.accuracy >= 80 ? "text-green-600" : u.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
                            {u.accuracy}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── TAB: تعيين المهام ────────────────────────────────────────────── */}
        {tab === "assign" && (
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">🎯 تعيين مهام على موسِّم</CardTitle></CardHeader>
              <CardContent className="space-y-4">

                {/* Project */}
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">المشروع</label>
                  <Select
                    value={assignProjectId?.toString() ?? ""}
                    onValueChange={v => { setAssignProjectId(Number(v)); setAssignUserId(null); }}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر مشروعاً..." /></SelectTrigger>
                    <SelectContent>
                      {(allProjects ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Unassigned count badge */}
                {assignProjectId && (
                  <div className="flex items-center gap-2 text-sm">
                    <ClipboardList className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      المهام غير المُعيَّنة:
                      <span className="font-bold text-primary mx-1">{unassigned?.length ?? 0}</span>
                      مهمة
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => refetchUnassigned()} className="h-6 px-2">
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {/* Tasker */}
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">الموسِّم</label>
                  <Select
                    value={assignUserId?.toString() ?? ""}
                    onValueChange={v => setAssignUserId(Number(v))}
                    disabled={!assignProjectId}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر موسِّماً..." /></SelectTrigger>
                    <SelectContent>
                      {taskers.map((u: any) => (
                        <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Count */}
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">عدد المهام</label>
                  <Input
                    type="number"
                    min={1}
                    max={unassigned?.length ?? 1}
                    value={assignCount}
                    onChange={e => setAssignCount(Number(e.target.value))}
                    className="w-32"
                  />
                </div>

                <Button
                  onClick={handleAssign}
                  disabled={assignTasks.isPending || !assignProjectId || !assignUserId}
                  className="w-full"
                >
                  {assignTasks.isPending ? "جارٍ التعيين..." : "🎯 تعيين المهام الآن"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── TAB: تقارير الجودة ──────────────────────────────────────────── */}
        {tab === "qa" && (
          <div className="space-y-6">

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "إجمالي مُقدَّمة",   value: stats?.submittedAnnotations  ?? 0, color: "text-amber-600  bg-amber-50"  },
                { label: "مقبولة",             value: stats?.approvedAnnotations   ?? 0, color: "text-green-600  bg-green-50"  },
                { label: "مرفوضة",             value: stats?.rejectedAnnotations   ?? 0, color: "text-red-600    bg-red-50"    },
              ].map(c => (
                <Card key={c.label}>
                  <CardContent className={`p-4 rounded-xl ${c.color}`}>
                    <div className="text-3xl font-bold">{c.value.toLocaleString()}</div>
                    <div className="text-sm mt-1 opacity-80">{c.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Per-tasker QA table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> أداء الموسِّمين - جودة التوسيم
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!leaderboard?.length ? (
                  <p className="text-slate-400 text-sm text-center py-8">لا توجد بيانات جودة بعد</p>
                ) : (
                  <>
                    <div className="mb-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={leaderboard?.slice(0, 10) ?? []}>
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis unit="%" domain={[0, 100]} />
                          <Tooltip formatter={(v: any) => `${v}%`} />
                          <Bar dataKey="accuracy" name="دقة التوسيم" fill="#10B981" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 text-right">
                          <th className="py-2 font-medium">#</th>
                          <th className="py-2 font-medium">الاسم</th>
                          <th className="py-2 font-medium">الصفة</th>
                          <th className="py-2 font-medium">إجمالي التوسيمات</th>
                          <th className="py-2 font-medium">المقبولة</th>
                          <th className="py-2 font-medium">الدقة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((u: any, i: number) => (
                          <tr key={u.userId} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2 text-slate-400">{i + 1}</td>
                            <td className="py-2 font-medium text-slate-800">{u.name}</td>
                            <td className="py-2">
                              <Badge className={`text-xs ${roleBadgeColor[u.role as Role] ?? roleBadgeColor.user}`}>
                                {roleLabel[u.role as Role] ?? u.role}
                              </Badge>
                            </td>
                            <td className="py-2 text-slate-600">{u.totalSubmitted}</td>
                            <td className="py-2 text-green-600 font-medium">{u.approvedCount}</td>
                            <td className="py-2">
                              <span className={`font-bold ${u.accuracy >= 80 ? "text-green-600" : u.accuracy >= 60 ? "text-amber-500" : "text-red-500"}`}>
                                {u.accuracy}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── TAB: قرارات QA ──────────────────────────────────────────────── */}
        {tab === "qadecisions" && (
          <div className="space-y-6">
            {/* Project summary cards */}
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                <Folder size={15} /> ملخص المشاريع
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
                {(projectSummary as any[]).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setQaDecisionsProjectId(qaDecisionsProjectId === p.id ? null : p.id)}
                    className={`text-right rounded-xl border p-4 transition-all ${
                      qaDecisionsProjectId === p.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${
                        p.status === "active" ? "bg-emerald-500" :
                        p.status === "paused" ? "bg-amber-400" : "bg-slate-400"
                      }`} />
                      <span className="text-xs text-slate-500">{
                        p.status === "active" ? "نشط" : p.status === "paused" ? "موقوف" : "مكتمل"
                      }</span>
                    </div>
                    <p className="font-semibold text-slate-800 text-sm mb-3 line-clamp-1">{p.name}</p>
                    <div className="flex gap-3 text-xs">
                      <span className="flex items-center gap-1 text-amber-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        {p.pendingCount} معلق
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 size={10} /> {p.approvedCount} مقبول
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <XCircle size={10} /> {p.rejectedCount} مرفوض
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {qaDecisionsProjectId && (
                <button
                  onClick={() => setQaDecisionsProjectId(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  عرض كل المشاريع
                </button>
              )}
            </div>

            {/* Decisions table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  قرارات QA النهائية
                  {qaDecisionsProjectId && (
                    <Badge variant="outline" className="text-xs mr-auto">
                      {(projectSummary as any[]).find((p: any) => p.id === qaDecisionsProjectId)?.name}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {qaDecisionsLoading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary mx-auto" />
                  </div>
                ) : (qaDecisions as any[]).length === 0 ? (
                  <div className="p-10 text-center text-slate-400">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>لا توجد قرارات QA بعد</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3 font-medium text-slate-500">#</th>
                          <th className="px-4 py-3 font-medium text-slate-500">المشروع</th>
                          <th className="px-4 py-3 font-medium text-slate-500">الموسِّم</th>
                          <th className="px-4 py-3 font-medium text-slate-500">المحتوى</th>
                          <th className="px-4 py-3 font-medium text-slate-500">نتيجة التوسيم</th>
                          <th className="px-4 py-3 font-medium text-slate-500">قرار QA</th>
                          <th className="px-4 py-3 font-medium text-slate-500">ملاحظات QA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(qaDecisions as any[]).map((row: any, i: number) => (
                          <tr key={row.annotationId} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  row.projectStatus === "active" ? "bg-emerald-500" :
                                  row.projectStatus === "paused" ? "bg-amber-400" : "bg-slate-400"
                                }`} />
                                <span className="text-slate-700 text-xs font-medium truncate max-w-[100px]">
                                  {row.projectName || "—"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs">{row.taskerName || "—"}</td>
                            <td className="px-4 py-3">
                              <p className="text-slate-600 text-xs line-clamp-2 max-w-[180px]">
                                {row.taskContent || "—"}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              {row.result ? (
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                                  {JSON.stringify(row.result).slice(0, 60)}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {row.annotationStatus === "approved" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={10} /> مقبول
                                </span>
                              ) : row.annotationStatus === "rejected" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                  <XCircle size={10} /> مرفوض
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs max-w-[140px]">
                              {row.qaFeedback || <span className="text-slate-300">لا توجد ملاحظات</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── TAB: إدارة الفريق ───────────────────────────────────────────── */}
        {tab === "team" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="بحث بالاسم أو الإيميل..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-64"
              />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="كل الصفات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الصفات</SelectItem>
                  <SelectItem value="tasker">موسِّمون</SelectItem>
                  <SelectItem value="qa">مراجعو جودة</SelectItem>
                  <SelectItem value="manager">مدراء</SelectItem>
                  <SelectItem value="admin">مدراء النظام</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setShowCreateDialog(true)} className="mr-auto gap-2">
                <Plus className="w-4 h-4" /> إضافة مستخدم
              </Button>
            </div>

            {/* Users count */}
            <p className="text-sm text-slate-500">{filteredUsers.length} مستخدم</p>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 text-right">
                      <th className="p-3 font-medium">الاسم</th>
                      <th className="p-3 font-medium">البريد الإلكتروني</th>
                      <th className="p-3 font-medium">الصفة</th>
                      <th className="p-3 font-medium">الحالة</th>
                      <th className="p-3 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u: any) => (
                      <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-800">{u.name}</td>
                        <td className="p-3 text-slate-500 text-xs">{u.email}</td>
                        <td className="p-3">
                          <Badge className={`text-xs ${roleBadgeColor[u.role as Role] ?? roleBadgeColor.user}`}>
                            {roleLabel[u.role as Role] ?? u.role}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                            {u.isActive ? <><UserCheck className="w-3 h-3" /> نشط</> : <><UserX className="w-3 h-3" /> معطل</>}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-600" onClick={() => openEdit(u)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className={`h-7 px-2 ${u.isActive ? "text-amber-600" : "text-green-600"}`}
                              onClick={() => updateUser.mutate({ id: u.id, isActive: !u.isActive })}
                            >
                              {u.isActive ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            </Button>
                            <Button
                              variant="ghost" size="sm" className="h-7 px-2 text-red-500"
                              onClick={() => setShowDeleteConfirm(u.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredUsers.length && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد نتائج</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* ── Edit Dialog ── */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>تعديل المستخدم</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium block mb-1">الاسم</label>
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">البريد الإلكتروني</label>
                    <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">الصفة</label>
                    <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v as Role }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tasker">موسِّم</SelectItem>
                        <SelectItem value="qa">مراجع جودة</SelectItem>
                        <SelectItem value="manager">مدير</SelectItem>
                        <SelectItem value="admin">مدير النظام</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
                  <Button onClick={() => updateUser.mutate(editForm)} disabled={updateUser.isPending}>حفظ</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── Create Dialog ── */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  {[
                    { label: "الاسم",               key: "name",     type: "text"     },
                    { label: "البريد الإلكتروني",   key: "email",    type: "email"    },
                    { label: "كلمة المرور",          key: "password", type: "password" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-sm font-medium block mb-1">{f.label}</label>
                      <Input
                        type={f.type}
                        value={(createForm as any)[f.key]}
                        onChange={e => setCreateForm(c => ({ ...c, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-sm font-medium block mb-1">الصفة</label>
                    <Select value={createForm.role} onValueChange={v => setCreateForm(c => ({ ...c, role: v as Role }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tasker">موسِّم</SelectItem>
                        <SelectItem value="qa">مراجع جودة</SelectItem>
                        <SelectItem value="manager">مدير</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>إلغاء</Button>
                  <Button
                    onClick={() => createUser.mutate(createForm)}
                    disabled={createUser.isPending || !createForm.name || !createForm.email || !createForm.password}
                  >
                    {createUser.isPending ? "جارٍ الإنشاء..." : "إنشاء"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── Delete Confirm ── */}
            <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
              <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
                <p className="text-slate-600 text-sm">هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع.</p>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>إلغاء</Button>
                  <Button
                    variant="destructive"
                    onClick={() => showDeleteConfirm && deleteUser.mutate({ id: showDeleteConfirm })}
                    disabled={deleteUser.isPending}
                  >
                    حذف
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
