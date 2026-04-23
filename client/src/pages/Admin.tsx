import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, FileText, CheckCircle2, TrendingUp, Plus, Pencil, Trash2, UserCheck, UserX, Download, Key, ClipboardList, BarChart3, Trophy, FolderPlus } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type Role = "admin" | "tasker" | "qa" | "user";
const roleLabel: Record<Role, string> = { admin: "مدير", tasker: "موسِّم", qa: "مراجع جودة", user: "مستخدم" };
const roleBadgeColor: Record<Role, string> = { admin: "bg-red-100 text-red-700", tasker: "bg-amber-100 text-amber-700", qa: "bg-blue-100 text-blue-700", user: "bg-gray-100 text-gray-700" };
const CHART_COLORS = ["#00D4A8", "#38BDF8", "#F59E0B", "#8B5CF6", "#EC4899", "#10B981"];

const TABS = [
  { id: "overview", label: "📊 نظرة عامة" },
  { id: "users", label: "👥 المستخدمون" },
  { id: "projects", label: "📁 المشاريع" },
  { id: "assign", label: "🎯 تعيين المهام" },
  { id: "leaderboard", label: "🏆 المتصدرون" },
  { id: "export", label: "📤 تصدير" },
] as const;

type Tab = typeof TABS[number]["id"];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");

  // Data queries
  const { data: allUsers, refetch: refetchUsers } = trpc.admin.getAllUsers.useQuery();
  const { data: allProjects, refetch: refetchProjects } = trpc.projects.getAll.useQuery();
  const { data: adminStats } = trpc.adminStats.get.useQuery();
  const { data: leaderboard } = trpc.leaderboard.get.useQuery();
  const [exportProjectId, setExportProjectId] = useState<number | null>(null);
  const { data: exportData } = trpc.export.projectAnnotations.useQuery({ projectId: exportProjectId! }, { enabled: exportProjectId !== null });

  // Assign tab state
  const [assignProjectId, setAssignProjectId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [assignCount, setAssignCount] = useState(10);
  const { data: unassignedTasks } = trpc.taskManagement.getUnassigned.useQuery(
    { projectId: assignProjectId!, limit: 200 },
    { enabled: assignProjectId !== null }
  );
  const assignTasks = trpc.taskManagement.assignTasks.useMutation({
    onSuccess: (r) => { toast.success(`✅ تم تعيين ${r.assigned} مهمة بنجاح`); },
    onError: (e) => toast.error(e.message),
  });

  // Mutations
  const createUser = trpc.admin.createUser.useMutation();
  const bulkCreate = trpc.admin.bulkCreateUsers.useMutation();
  const updateUser = trpc.admin.updateUser.useMutation();
  const deleteUser = trpc.admin.deleteUser.useMutation();
  const resetPassword = trpc.passwordManagement.resetPassword.useMutation();
  const createProject = trpc.taskManagement.createProjectWithTasks.useMutation({
    onSuccess: () => { toast.success("✅ تم إنشاء المشروع"); refetchProjects(); setShowProjectDialog(false); },
    onError: (e) => toast.error(e.message),
  });

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showResetPwDialog, setShowResetPwDialog] = useState<{ id: number; name: string } | null>(null);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [bulkResult, setBulkResult] = useState<any[] | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState({ name: "", email: "", role: "tasker" as Role, password: "" });
  const [bulkForm, setBulkForm] = useState({ count: 5, role: "tasker" as "tasker" | "qa", prefix: "" });
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "user" as Role, isActive: true });
  const [newPassword, setNewPassword] = useState("");
  const [projectForm, setProjectForm] = useState({ name: "", description: "", labelStudioProjectId: 0, tasksText: "" });

  if (user?.role !== "admin") {
    return <ArabAnnotatorsDashboardLayout><div className="text-center py-12 text-red-600 font-semibold">ليس لديك صلاحية الوصول</div></ArabAnnotatorsDashboardLayout>;
  }

  // Filtered users
  const filteredUsers = useMemo(() =>
    allUsers?.filter(u =>
      !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
    ) ?? [], [allUsers, search]);

  const taskers = allUsers?.filter(u => u.role === "tasker" && u.isActive) ?? [];

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleCreateUser() {
    if (!createForm.name || !createForm.email || !createForm.password) { toast.error("يرجى ملء جميع الحقول"); return; }
    try { await createUser.mutateAsync(createForm); toast.success("✅ تم إنشاء المستخدم"); setShowCreateDialog(false); setCreateForm({ name: "", email: "", role: "tasker", password: "" }); refetchUsers(); }
    catch (e: any) { toast.error(e.message || "فشل الإنشاء"); }
  }
  async function handleBulkCreate() {
    try { const r = await bulkCreate.mutateAsync(bulkForm); setBulkResult(r.created); toast.success(`✅ تم إنشاء ${r.created.length} مستخدم`); refetchUsers(); }
    catch (e: any) { toast.error(e.message || "فشل"); }
  }
  function openEdit(u: any) { setSelectedUser(u); setEditForm({ name: u.name || "", email: u.email || "", role: u.role as Role, isActive: u.isActive }); setShowEditDialog(true); }
  async function handleEditUser() {
    if (!selectedUser) return;
    try { await updateUser.mutateAsync({ id: selectedUser.id, ...editForm }); toast.success("✅ تم التحديث"); setShowEditDialog(false); refetchUsers(); }
    catch (e: any) { toast.error(e.message || "فشل"); }
  }
  async function handleDeleteUser(id: number) {
    try { await deleteUser.mutateAsync({ id }); toast.success("تم الحذف"); setShowDeleteConfirm(null); refetchUsers(); }
    catch (e: any) { toast.error(e.message || "فشل"); }
  }
  async function handleResetPassword() {
    if (!showResetPwDialog || !newPassword || newPassword.length < 6) { toast.error("كلمة المرور قصيرة جداً (6 أحرف على الأقل)"); return; }
    try { await resetPassword.mutateAsync({ userId: showResetPwDialog.id, newPassword }); toast.success(`✅ تم تغيير كلمة مرور ${showResetPwDialog.name}`); setShowResetPwDialog(null); setNewPassword(""); }
    catch (e: any) { toast.error(e.message || "فشل"); }
  }
  async function handleAssignTasks() {
    if (!assignProjectId || !assignUserId) { toast.error("اختر مشروعاً ومستخدماً"); return; }
    const toAssign = (unassignedTasks ?? []).slice(0, assignCount).map(t => t.id);
    if (!toAssign.length) { toast.error("لا توجد مهام غير معيّنة"); return; }
    await assignTasks.mutateAsync({ taskIds: toAssign, userId: assignUserId });
  }
  function downloadCSV(data: any[], filename: string) {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(row => Object.values(row).map(v => `"${String(typeof v === "object" ? JSON.stringify(v) : v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }
  function downloadJSON(data: any[], filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }

  // ── Charts data ───────────────────────────────────────────────────────────────
  const roleDistribution = [
    { name: "موسِّمون", value: allUsers?.filter(u => u.role === "tasker").length ?? 0 },
    { name: "مراجعو جودة", value: allUsers?.filter(u => u.role === "qa").length ?? 0 },
    { name: "مدراء", value: allUsers?.filter(u => u.role === "admin").length ?? 0 },
  ].filter(d => d.value > 0);

  const annotationStatus = [
    { name: "معلقة", value: adminStats?.pendingAnnotations ?? 0, fill: "#F59E0B" },
    { name: "مقبولة", value: adminStats?.approvedAnnotations ?? 0, fill: "#00D4A8" },
    { name: "مرفوضة", value: adminStats?.rejectedAnnotations ?? 0, fill: "#EF4444" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <ArabAnnotatorsDashboardLayout title="لوحة التحكم">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 flex-wrap border-b border-gray-200 pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t.id ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "إجمالي المستخدمين", value: adminStats?.totalUsers ?? 0, icon: Users, color: "text-blue-600 bg-blue-50" },
              { label: "المشاريع", value: adminStats?.totalProjects ?? 0, icon: FileText, color: "text-green-600 bg-green-50" },
              { label: "توسيمات اليوم", value: adminStats?.todayAnnotations ?? 0, icon: TrendingUp, color: "text-amber-600 bg-amber-50" },
              { label: "مقبولة إجمالاً", value: adminStats?.approvedAnnotations ?? 0, icon: CheckCircle2, color: "text-purple-600 bg-purple-50" },
            ].map(({ label, value, icon: Icon, color }, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className="text-3xl font-bold text-gray-900">{value.toLocaleString("ar")}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${color}`}><Icon size={22} /></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Daily trend */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">التوسيمات (آخر 7 أيام)</CardTitle></CardHeader>
              <CardContent>
                {adminStats?.dailyTrend && adminStats.dailyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={adminStats.dailyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${v} توسيم`, ""]} />
                      <Bar dataKey="total" fill="#00D4A8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 text-center py-8 text-sm">لا توجد بيانات بعد</p>}
              </CardContent>
            </Card>

            {/* Annotation status pie */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">حالة التوسيمات</CardTitle></CardHeader>
              <CardContent>
                {annotationStatus.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={annotationStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {annotationStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 text-center py-8 text-sm">لا توجد توسيمات بعد</p>}
              </CardContent>
            </Card>

            {/* Role distribution */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">توزيع الأدوار</CardTitle></CardHeader>
              <CardContent>
                {roleDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={roleDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                        {roleDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 text-center py-8 text-sm">لا توجد مستخدمون</p>}
              </CardContent>
            </Card>

            {/* Projects progress */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">تقدم المشاريع</CardTitle></CardHeader>
              <CardContent>
                {allProjects?.length ? (
                  <div className="space-y-3">
                    {allProjects.slice(0, 5).map(p => (
                      <div key={p.id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-700 truncate max-w-[60%]">{p.name}</span>
                          <span className="text-gray-500">{Math.round((p.completedItems / (p.totalItems || 1)) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#00D4A8] to-[#38BDF8] rounded-full transition-all"
                            style={{ width: `${Math.round((p.completedItems / (p.totalItems || 1)) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-center py-8 text-sm">لا توجد مشاريع</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Users ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input placeholder="🔍 بحث بالاسم أو البريد..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowBulkDialog(true)}><Plus size={15} className="ml-1" />إنشاء جماعي</Button>
              <Button size="sm" onClick={() => setShowCreateDialog(true)}><Plus size={15} className="ml-1" />مستخدم جديد</Button>
            </div>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>{["الاسم", "البريد", "الدور", "الحالة", "إجراءات"].map(h => <th key={h} className="px-4 py-3 text-right font-medium text-gray-600">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.email || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleBadgeColor[u.role as Role] || "bg-gray-100 text-gray-600"}`}>
                          {roleLabel[u.role as Role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.isActive ? <span className="flex items-center gap-1 text-green-600 text-xs"><UserCheck size={13} />نشط</span>
                          : <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={13} />موقوف</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(u)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="تعديل"><Pencil size={14} /></button>
                          <button onClick={() => setShowResetPwDialog({ id: u.id, name: u.name || "" })} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded" title="إعادة تعيين كلمة المرور"><Key size={14} /></button>
                          <button onClick={() => setShowDeleteConfirm(u.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="حذف"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">لا توجد نتائج</p>}
            </div>
          </Card>
        </div>
      )}

      {/* ── Projects ── */}
      {tab === "projects" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">المشاريع ({allProjects?.length ?? 0})</h2>
            <Button size="sm" onClick={() => setShowProjectDialog(true)}><FolderPlus size={15} className="ml-1" />مشروع جديد</Button>
          </div>
          {allProjects?.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold truncate">{p.name}</h3>
                  {p.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{p.description}</p>}
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>مكتمل: {p.completedItems}/{p.totalItems}</span>
                    <span>مراجَع: {p.reviewedItems}</span>
                    <span className={p.status === "active" ? "text-green-600 font-medium" : "text-gray-400"}>
                      {p.status === "active" ? "نشط" : p.status === "paused" ? "موقوف" : "مكتمل"}
                    </span>
                  </div>
                </div>
                <div className="text-right min-w-[90px] mr-4">
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#00D4A8] to-[#38BDF8]"
                      style={{ width: `${Math.round((p.completedItems / (p.totalItems || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-gray-400">{Math.round((p.completedItems / (p.totalItems || 1)) * 100)}%</span>
                </div>
              </div>
            </Card>
          ))}
          {!allProjects?.length && <p className="text-center text-gray-400 py-10">لا توجد مشاريع — ابدأ بإنشاء مشروع جديد</p>}
        </div>
      )}

      {/* ── Assign Tasks ── */}
      {tab === "assign" && (
        <div className="space-y-4 max-w-xl">
          <h2 className="text-lg font-bold">🎯 تعيين المهام للمصنفين</h2>
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">المشروع</label>
              <Select onValueChange={v => setAssignProjectId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="اختر مشروعاً" /></SelectTrigger>
                <SelectContent>{allProjects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {assignProjectId && (
              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                المهام غير المعيّنة: <strong>{unassignedTasks?.length ?? "..."}</strong>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">المصنِّف</label>
              <Select onValueChange={v => setAssignUserId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="اختر مصنِّفاً" /></SelectTrigger>
                <SelectContent>{taskers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">عدد المهام للتعيين</label>
              <Input type="number" min={1} max={500} value={assignCount} onChange={e => setAssignCount(Number(e.target.value))} />
            </div>
            <Button onClick={handleAssignTasks} disabled={assignTasks.isPending || !assignProjectId || !assignUserId} className="w-full">
              {assignTasks.isPending ? "جارٍ التعيين..." : `تعيين ${assignCount} مهمة`}
            </Button>
          </Card>
        </div>
      )}

      {/* ── Leaderboard ── */}
      {tab === "leaderboard" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">🏆 المتصدرون</h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["#", "الاسم", "الدور", "مُسلَّمة", "مقبولة", "الدقة"].map(h => (
                      <th key={h} className="px-4 py-3 text-right font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaderboard?.map((entry, i) => (
                    <tr key={entry.userId} className={`hover:bg-gray-50 transition-colors ${i < 3 ? "font-semibold" : ""}`}>
                      <td className="px-4 py-3">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-gray-400">#{i + 1}</span>}
                      </td>
                      <td className="px-4 py-3">{entry.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${roleBadgeColor[entry.role as Role] || "bg-gray-100 text-gray-600"}`}>
                          {roleLabel[entry.role as Role] || entry.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{entry.totalSubmitted}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{entry.approvedCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-16">
                            <div className={`h-full rounded-full ${entry.accuracy >= 80 ? "bg-green-500" : entry.accuracy >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${entry.accuracy}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 w-10">{entry.accuracy}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!leaderboard?.length && <p className="text-center text-gray-400 py-10 text-sm">لا توجد بيانات بعد — ابدأ التوسيم أولاً</p>}
            </div>
          </Card>
        </div>
      )}

      {/* ── Export ── */}
      {tab === "export" && (
        <div className="space-y-4 max-w-lg">
          <h2 className="text-lg font-bold">📤 تصدير البيانات</h2>
          <Card className="p-6 space-y-4">
            <p className="text-sm text-gray-500">اختر مشروعاً لتصدير كل توسيماته بصيغة JSON أو CSV:</p>
            <Select onValueChange={v => setExportProjectId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="اختر مشروعاً" /></SelectTrigger>
              <SelectContent>{allProjects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-3">
              <Button variant="outline" disabled={!exportData} onClick={() => exportData && downloadJSON(exportData, `project_${exportProjectId}.json`)} className="flex-1">
                <Download size={15} className="ml-1" />JSON
              </Button>
              <Button disabled={!exportData} onClick={() => exportData && downloadCSV(exportData, `project_${exportProjectId}.csv`)} className="flex-1">
                <Download size={15} className="ml-1" />CSV
              </Button>
            </div>
            {exportData && <p className="text-xs text-green-600">✅ {exportData.length} توسيم جاهز للتصدير</p>}
          </Card>

          {/* Export users CSV */}
          <Card className="p-6 space-y-3">
            <h3 className="font-medium text-gray-800">تصدير قائمة المستخدمين</h3>
            <p className="text-sm text-gray-500">تصدير جميع المستخدمين مع بياناتهم (بدون كلمات المرور)</p>
            <Button variant="outline" onClick={() => {
              const data = allUsers?.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt })) ?? [];
              downloadCSV(data, "users.csv");
            }} className="w-full">
              <Download size={15} className="ml-1" />تصدير المستخدمين CSV
            </Button>
          </Card>
        </div>
      )}

      {/* ══ Dialogs ══════════════════════════════════════════════════════════════ */}

      {/* Create User */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إنشاء مستخدم جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium">الاسم</label><Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">البريد</label><Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">كلمة المرور</label><Input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="6 أحرف على الأقل" className="mt-1" /></div>
            <div><label className="text-sm font-medium">الدور</label>
              <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v as Role }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tasker">موسِّم</SelectItem><SelectItem value="qa">مراجع جودة</SelectItem><SelectItem value="admin">مدير</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreateUser} disabled={createUser.isPending}>{createUser.isPending ? "جارٍ الإنشاء..." : "إنشاء"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create */}
      <Dialog open={showBulkDialog} onOpenChange={o => { setShowBulkDialog(o); if (!o) setBulkResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>إنشاء جماعي</DialogTitle></DialogHeader>
          {!bulkResult ? (
            <>
              <div className="space-y-3 py-2">
                <div><label className="text-sm font-medium">الدور</label>
                  <Select value={bulkForm.role} onValueChange={v => setBulkForm(f => ({ ...f, role: v as "tasker" | "qa" }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="tasker">موسِّم</SelectItem><SelectItem value="qa">مراجع جودة</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><label className="text-sm font-medium">العدد (1–50)</label><Input type="number" min={1} max={50} value={bulkForm.count} onChange={e => setBulkForm(f => ({ ...f, count: Number(e.target.value) }))} className="mt-1" /></div>
                <div><label className="text-sm font-medium">بادئة الاسم (اختياري)</label><Input value={bulkForm.prefix} onChange={e => setBulkForm(f => ({ ...f, prefix: e.target.value }))} placeholder="مثال: annotator" className="mt-1" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkDialog(false)}>إلغاء</Button>
                <Button onClick={handleBulkCreate} disabled={bulkCreate.isPending}>{bulkCreate.isPending ? "جارٍ..." : `إنشاء ${bulkForm.count}`}</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="py-2">
                <p className="text-green-600 font-medium mb-3">✅ تم إنشاء {bulkResult.length} مستخدم</p>
                <div className="max-h-52 overflow-y-auto border rounded-lg text-xs">
                  <table className="w-full"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-right">الاسم</th><th className="px-3 py-2 text-right">كلمة المرور</th></tr></thead>
                    <tbody className="divide-y">{bulkResult.map((u, i) => <tr key={i}><td className="px-3 py-2">{u.name}</td><td className="px-3 py-2 font-mono">{u.password}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowBulkDialog(false); setBulkResult(null); }}>إغلاق</Button>
                <Button onClick={() => downloadCSV(bulkResult, "users_credentials.csv")}><Download size={14} className="ml-1" />CSV</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>تعديل المستخدم</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium">الاسم</label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">البريد</label><Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">الدور</label>
              <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v as Role }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tasker">موسِّم</SelectItem><SelectItem value="qa">مراجع جودة</SelectItem><SelectItem value="admin">مدير</SelectItem><SelectItem value="user">مستخدم</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">الحالة:</label>
              <button onClick={() => setEditForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${editForm.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                {editForm.isActive ? "نشط" : "موقوف"}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleEditUser} disabled={updateUser.isPending}>{updateUser.isPending ? "جارٍ..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password */}
      <Dialog open={showResetPwDialog !== null} onOpenChange={o => { if (!o) { setShowResetPwDialog(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>🔑 إعادة تعيين كلمة المرور</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-1">تغيير كلمة مرور: <strong>{showResetPwDialog?.name}</strong></p>
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="كلمة المرور الجديدة (6 أحرف+)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPwDialog(null)}>إلغاء</Button>
            <Button onClick={handleResetPassword} disabled={resetPassword.isPending} className="bg-amber-500 hover:bg-amber-600">
              {resetPassword.isPending ? "جارٍ..." : "تغيير"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Project */}
      <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📁 إنشاء مشروع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-sm font-medium">اسم المشروع *</label><Input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: تصنيف الجمل السعودية" className="mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">الوصف</label><Input value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>

            {/* Annotation type */}
            <div className="border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">🏷️ إعدادات التوسيم</h3>
              <div>
                <label className="text-sm font-medium">نوع التوسيم</label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={(projectForm as any).annotationType ?? "classification"}
                  onChange={e => setProjectForm(f => ({ ...f, annotationType: e.target.value } as any))}
                >
                  <option value="classification">تصنيف نصي (اختيار واحد)</option>
                  <option value="multi_classification">تصنيف متعدد (أكثر من اختيار)</option>
                  <option value="ner">تحديد كيانات (NER)</option>
                  <option value="pairwise">مقارنة نصين</option>
                  <option value="relations">علاقات بين كيانات</option>
                </select>
              </div>

              {/* Labels */}
              <div>
                <label className="text-sm font-medium">التصنيفات / التسميات</label>
                <p className="text-xs text-slate-400 mb-2">كل سطر: اسم التسمية،اللون الهكس،الاختصار — مثال: إيجابي,#00D4A8,1</p>
                <textarea
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 h-24 bg-white"
                  placeholder={"إيجابي,#00D4A8,1\nسلبي,#EF4444,2\nمحايد,#94A3B8,3"}
                  value={(projectForm as any).labelsRaw ?? ""}
                  onChange={e => setProjectForm(f => ({ ...f, labelsRaw: e.target.value } as any))}
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="text-sm font-medium">تعليمات التوسيم (تظهر للموسِّم)</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 h-20 bg-white mt-1"
                  placeholder="اقرأ النص بعناية ثم اختر التصنيف المناسب..."
                  dir="rtl"
                  value={(projectForm as any).instructions ?? ""}
                  onChange={e => setProjectForm(f => ({ ...f, instructions: e.target.value } as any))}
                />
              </div>

              {/* Options */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="number" min={1} max={10}
                    className="w-14 border border-slate-200 rounded px-2 py-1 text-sm text-center"
                    value={(projectForm as any).minAnnotations ?? 1}
                    onChange={e => setProjectForm(f => ({ ...f, minAnnotations: Number(e.target.value) } as any))}
                  />
                  <span className="text-slate-600">توسيمات مطلوبة لكل مهمة</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox"
                    checked={(projectForm as any).aiPreAnnotation ?? false}
                    onChange={e => setProjectForm(f => ({ ...f, aiPreAnnotation: e.target.checked } as any))}
                    className="rounded"
                  />
                  <span className="text-slate-600">🤖 اقتراحات AI للموسِّم</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox"
                    checked={(projectForm as any).qaAiEnabled ?? false}
                    onChange={e => setProjectForm(f => ({ ...f, qaAiEnabled: e.target.checked } as any))}
                    className="rounded"
                  />
                  <span className="text-slate-600">🔍 مساعد AI للمراجعة (QA)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox"
                    checked={(projectForm as any).spamDetection ?? false}
                    onChange={e => setProjectForm(f => ({ ...f, spamDetection: e.target.checked } as any))}
                    className="rounded"
                  />
                  <span className="text-slate-600">🛡️ كاشف الإجابات العشوائية</span>
                </label>
              </div>
            </div>

            {/* Tasks */}
            <div>
              <label className="text-sm font-medium">المهام (جملة في كل سطر) *</label>
              <textarea
                value={projectForm.tasksText}
                onChange={e => setProjectForm(f => ({ ...f, tasksText: e.target.value }))}
                placeholder={"الجملة الأولى\nالجملة الثانية\nالجملة الثالثة..."}
                className="mt-1 w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 h-36 font-mono bg-white"
                dir="rtl"
              />
              <p className="text-xs text-slate-400 mt-1">
                {projectForm.tasksText.split("\n").filter(s => s.trim()).length} جملة
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectDialog(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                // Parse labels
                const labelsRaw = (projectForm as any).labelsRaw ?? "";
                const labels = labelsRaw.split("\n").filter((s: string) => s.trim()).map((line: string) => {
                  const parts = line.split(",");
                  return { value: parts[0]?.trim() ?? "", color: parts[1]?.trim() ?? "#888", shortcut: parts[2]?.trim() };
                }).filter((l: any) => l.value);

                await createProject.mutateAsync({
                  ...projectForm,
                  annotationType: (projectForm as any).annotationType ?? "classification",
                  labelsConfig: { labels },
                  instructions: (projectForm as any).instructions,
                  minAnnotations: (projectForm as any).minAnnotations ?? 1,
                  aiPreAnnotation: (projectForm as any).aiPreAnnotation ?? false,
                  qaAiEnabled: (projectForm as any).qaAiEnabled ?? false,
                  spamDetection: (projectForm as any).spamDetection ?? false,
                } as any);
              }}
              disabled={createProject.isPending || !projectForm.name || !projectForm.tasksText.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {createProject.isPending ? "جارٍ الإنشاء..." : "إنشاء المشروع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={showDeleteConfirm !== null} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-gray-600 py-2">هل أنت متأكد؟ لا يمكن التراجع.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDeleteUser(showDeleteConfirm)} disabled={deleteUser.isPending}>
              {deleteUser.isPending ? "جارٍ..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ArabAnnotatorsDashboardLayout>
  );
}
