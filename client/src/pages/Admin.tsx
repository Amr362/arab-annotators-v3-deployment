import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, FileText, CheckCircle2, TrendingUp, Plus, Pencil, Trash2, UserCheck, UserX,
  Download, Key, ClipboardList, Trophy, AlertTriangle, RefreshCw,
} from "lucide-react";
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
const roleBadgeColor: Record<Role, string> = {
  admin: "bg-red-100 text-red-700",
  tasker: "bg-amber-100 text-amber-700",
  qa: "bg-blue-100 text-blue-700",
  user: "bg-gray-100 text-gray-700",
};

const PAGE_SIZE = 50;

const TABS = [
  { id: "overview",    label: "📊 نظرة عامة"   },
  { id: "users",       label: "👥 المستخدمون"  },
  { id: "assign",      label: "🎯 تعيين المهام" },
  { id: "leaderboard", label: "🏆 المتصدرون"   },
  { id: "export",      label: "📤 تصدير"       },
] as const;
type Tab = typeof TABS[number]["id"];

export default function Admin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  
  // User Management State
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showResetPwDialog, setShowResetPwDialog] = useState<{ id: number; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "tasker" as Role });
  const [editForm, setEditForm] = useState({ id: 0, name: "", email: "", role: "tasker" as Role, isActive: true });
  const [bulkForm, setBulkForm] = useState({ role: "tasker" as "tasker" | "qa", count: 10, prefix: "" });
  const [bulkResult, setBulkResult] = useState<any[] | null>(null);

  // Assign State
  const [assignProjectId, setAssignProjectId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [assignCount, setAssignCount] = useState(10);

  // Export State
  const [exportProjectId, setExportProjectId] = useState<number | null>(null);

  // Queries
  const { data: adminStats } = trpc.adminStats.get.useQuery();
  const { data: users = [] } = trpc.admin.getAllUsers.useQuery();
  const { data: allProjects } = trpc.projects.getAll.useQuery();
  const { data: leaderboard } = trpc.leaderboard.get.useQuery();
  const { data: unassignedTasks } = trpc.admin.getUnassigned.useQuery(
    { projectId: assignProjectId ?? 0 },
    { enabled: !!assignProjectId }
  );
  const { data: exportData } = trpc.export.projectAnnotations.useQuery(
    { projectId: exportProjectId ?? 0 },
    { enabled: !!exportProjectId }
  );

  // Mutations
  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => { toast.success("تم إنشاء المستخدم"); setShowCreateDialog(false); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  const bulkCreate = trpc.admin.bulkCreateUsers.useMutation({
    onSuccess: (data) => { setBulkResult(data); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => { toast.success("تم تحديث المستخدم"); setShowEditDialog(false); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { toast.success("تم حذف المستخدم"); setShowDeleteConfirm(null); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  const resetPw = trpc.passwordManagement.resetPassword.useMutation({
    onSuccess: () => { toast.success("تم تغيير كلمة المرور"); setShowResetPwDialog(null); setNewPassword(""); },
    onError: (e) => toast.error(e.message),
  });

  const assignTasks = trpc.admin.assignTasks.useMutation({
    onSuccess: (r) => { toast.success(`تم تعيين ${r.assigned} مهمة`); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  // Handlers
  const handleCreateUser = () => createUser.mutate(createForm);
  const handleBulkCreate = () => bulkCreate.mutate(bulkForm);
  const handleEditUser = () => updateUser.mutate(editForm);
  const handleDeleteUser = (id: number) => deleteUser.mutate({ id });
  const handleResetPassword = () => {
    if (newPassword.length < 6) return toast.error("كلمة المرور قصيرة جداً");
    if (showResetPwDialog) resetPw.mutate({ userId: showResetPwDialog.id, newPassword });
  };
  const handleAssignTasks = () => {
    if (!assignProjectId || !assignUserId) return;
    // The server expects taskIds: number[], userId: number
    // unassignedTasks might be undefined or empty if not loaded yet
    if (!unassignedTasks || unassignedTasks.length === 0) {
      toast.error("لا توجد مهام غير معينة أو لم يتم تحميل البيانات بعد");
      return;
    }
    const ids = unassignedTasks.slice(0, assignCount).map(t => t.id);
    if (ids.length === 0) {
      toast.error("لم يتم العثور على مهام لتعيينها");
      return;
    }
    assignTasks.mutate({ taskIds: ids, userId: assignUserId });
  };

  const openEdit = (u: any) => {
    setEditForm({ id: u.id, name: u.name || "", email: u.email, role: u.role as Role, isActive: u.isActive });
    setShowEditDialog(true);
  };

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const taskers = users.filter(u => u.role === "tasker");

  // Stats Helpers
  const projectCounts = useMemo(() => ({
    active: allProjects?.filter(p => p.status === "active").length ?? 0,
    paused: allProjects?.filter(p => p.status === "paused").length ?? 0,
    completed: allProjects?.filter(p => p.status === "completed").length ?? 0,
  }), [allProjects]);

  const annotationStatus = [
    { name: "مقبولة", value: adminStats?.approvedAnnotations ?? 0, fill: "#10B981" },
    { name: "مرفوضة", value: adminStats?.rejectedAnnotations ?? 0, fill: "#EF4444" },
    { name: "قيد المراجعة", value: adminStats?.submittedAnnotations ?? 0, fill: "#F59E0B" },
  ];

  const roleDistribution = [
    { name: "موسِّمين", value: users.filter(u => u.role === "tasker").length },
    { name: "مراجعين", value: users.filter(u => u.role === "qa").length },
    { name: "مدراء", value: users.filter(u => u.role === "admin").length },
  ];

  // Export Helpers
  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(row => Object.values(row).map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    link.click();
  };

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

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "إجمالي المستخدمين", value: adminStats?.totalUsers ?? 0,         icon: Users,        color: "text-blue-600 bg-blue-50"     },
              { label: "المشاريع",           value: adminStats?.totalProjects ?? 0,       icon: FileText,     color: "text-green-600 bg-green-50"   },
              { label: "توسيمات اليوم",      value: adminStats?.todayAnnotations ?? 0,    icon: TrendingUp,   color: "text-amber-600 bg-amber-50"   },
              { label: "مقبولة إجمالاً",     value: adminStats?.approvedAnnotations ?? 0, icon: CheckCircle2, color: "text-purple-600 bg-purple-50" },
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

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "مشاريع نشطة", val: projectCounts.active,    bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
              { label: "موقوفة مؤقتاً", val: projectCounts.paused,  bg: "bg-amber-50 border-amber-200",    text: "text-amber-700",   dot: "bg-amber-400"   },
              { label: "مكتملة",       val: projectCounts.completed, bg: "bg-blue-50 border-blue-200",     text: "text-blue-700",    dot: "bg-blue-500"    },
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">📈 حالة التوسيمات</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={annotationStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {annotationStatus.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">👥 توزيع الأدوار</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roleDistribution}>
                    <XAxis dataKey="name" /><YAxis /><Tooltip />
                    <Bar dataKey="value" fill="#38BDF8" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── USERS ── */}
      {tab === "users" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xl">إدارة المستخدمين</CardTitle>
            <div className="flex gap-2">
              <Button onClick={() => setShowBulkDialog(true)} variant="outline" size="sm"><Plus size={16} className="ml-1" /> إنشاء دفعة</Button>
              <Button onClick={() => setShowCreateDialog(true)} size="sm"><Plus size={16} className="ml-1" /> مستخدم جديد</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4"><Input placeholder="بحث بالاسم أو البريد..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">الاسم</th>
                    <th className="px-4 py-3 font-medium">البريد</th>
                    <th className="px-4 py-3 font-medium">الدور</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-gray-500">{u.email}</td>
                      <td className="px-4 py-3"><Badge className={roleBadgeColor[u.role as Role]}>{roleLabel[u.role as Role]}</Badge></td>
                      <td className="px-4 py-3">{u.isActive
                        ? <span className="text-green-600 flex items-center gap-1"><UserCheck size={14} /> نشط</span>
                        : <span className="text-red-400 flex items-center gap-1"><UserX size={14} /> موقوف</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil size={16} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setShowResetPwDialog({ id: u.id, name: u.name || "" })}><Key size={16} className="text-amber-500" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setShowDeleteConfirm(u.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={16} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ASSIGN ── */}
      {tab === "assign" && (
        <Card>
          <CardHeader><CardTitle className="text-xl">تعيين المهام للموسِّمين</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">1. اختر المشروع</label>
                <Select onValueChange={v => setAssignProjectId(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر مشروعاً..." /></SelectTrigger>
                  <SelectContent>
                    {allProjects?.filter(p => p.status === "active").map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">2. اختر الموسِّم</label>
                <Select onValueChange={v => setAssignUserId(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر موسِّماً..." /></SelectTrigger>
                  <SelectContent>{taskers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">3. عدد المهام</label>
                <Input type="number" value={assignCount} onChange={e => setAssignCount(Number(e.target.value))} className="mt-1" />
              </div>
            </div>
            {assignProjectId && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3 text-slate-600">
                  <ClipboardList size={20} className="text-primary" />
                  <span className="text-sm">المهام المتاحة: <strong>{unassignedTasks?.length ?? 0}</strong> مهمة غير معيّنة</span>
                </div>
                <Button onClick={handleAssignTasks} disabled={assignTasks.isPending || !unassignedTasks?.length} className="bg-primary hover:bg-primary/90">
                  {assignTasks.isPending ? "جارٍ التعيين..." : "تعيين المهام الآن"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── LEADERBOARD ── */}
      {tab === "leaderboard" && (
        <Card>
          <CardHeader><CardTitle className="text-xl flex items-center gap-2"><Trophy className="text-amber-500" /> المتصدرون</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">الترتيب</th>
                    <th className="px-4 py-3 font-medium">الموسِّم</th>
                    <th className="px-4 py-3 font-medium">إجمالي المنجز</th>
                    <th className="px-4 py-3 font-medium">مقبولة</th>
                    <th className="px-4 py-3 font-medium">الدقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaderboard?.map((u, i) => (
                    <tr key={u.userId} className={i < 3 ? "bg-amber-50/30" : ""}>
                      <td className="px-4 py-3 font-bold text-gray-400">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </td>
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3">{u.totalSubmitted}</td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{u.approvedCount}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="border-emerald-200 text-emerald-700">{u.accuracy}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── EXPORT ── */}
      {tab === "export" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-lg">تصدير البيانات</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">اختر المشروع</label>
                <Select onValueChange={v => setExportProjectId(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر مشروعاً..." /></SelectTrigger>
                  <SelectContent>{allProjects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 pt-1">
                <Button className="w-full" disabled={!exportProjectId || !exportData?.length} onClick={() => downloadCSV(exportData || [], "export.csv")}>تصدير CSV</Button>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-lg">معاينة البيانات</CardTitle></CardHeader>
            <CardContent>
              <div className="h-52 flex items-center justify-center text-slate-400">
                {exportProjectId ? "عرض البيانات المتاحة للتصدير" : "اختر مشروعاً للمعاينة"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════ DIALOGS ════════════ */}

      {/* Create User */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إنشاء مستخدم جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium">الاسم الكامل</label><Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">البريد الإلكتروني</label><Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">كلمة المرور</label><Input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">الدور</label>
              <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v as Role }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tasker">موسِّم</SelectItem><SelectItem value="qa">مراجع جودة</SelectItem><SelectItem value="admin">مدير</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreateUser} disabled={createUser.isPending}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إنشاء دفعة مستخدمين</DialogTitle></DialogHeader>
          {!bulkResult ? (
            <>
              <div className="space-y-4 py-2">
                <div><label className="text-sm font-medium">الدور</label>
                  <Select value={bulkForm.role} onValueChange={v => setBulkForm(f => ({ ...f, role: v as "tasker" | "qa" }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="tasker">موسِّم</SelectItem><SelectItem value="qa">مراجع جودة</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><label className="text-sm font-medium">العدد</label><Input type="number" value={bulkForm.count} onChange={e => setBulkForm(f => ({ ...f, count: Number(e.target.value) }))} className="mt-1" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkDialog(false)}>إلغاء</Button>
                <Button onClick={handleBulkCreate} disabled={bulkCreate.isPending}>إنشاء</Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-2">
              <p className="text-green-600 mb-3">✅ تم إنشاء {bulkResult.length} مستخدم</p>
              <Button onClick={() => { setShowBulkDialog(false); setBulkResult(null); }}>إغلاق</Button>
            </div>
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
                <SelectContent><SelectItem value="tasker">موسِّم</SelectItem><SelectItem value="qa">مراجع جودة</SelectItem><SelectItem value="admin">مدير</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleEditUser} disabled={updateUser.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password */}
      <Dialog open={showResetPwDialog !== null} onOpenChange={o => { if (!o) setShowResetPwDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إعادة تعيين كلمة المرور</DialogTitle></DialogHeader>
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="كلمة المرور الجديدة" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPwDialog(null)}>إلغاء</Button>
            <Button onClick={handleResetPassword} disabled={resetPw.isPending}>تغيير</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User */}
      <Dialog open={showDeleteConfirm !== null} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-gray-600 py-2">هل أنت متأكد؟ لا يمكن التراجع.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDeleteUser(showDeleteConfirm)} disabled={deleteUser.isPending}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ArabAnnotatorsDashboardLayout>
  );
}
// Trigger rebuild Sat Apr 25 08:59:00 EDT 2026
