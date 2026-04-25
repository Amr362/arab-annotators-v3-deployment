import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, FileText, CheckCircle2, TrendingUp, Plus, Pencil, Trash2, UserCheck, UserX,
  Download, Key, ClipboardList, Trophy, FolderPlus, Play, Pause, CheckSquare,
  Database, X, ChevronLeft, ChevronRight, PlusCircle, AlertTriangle, RefreshCw, Layers,
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
type ProjectStatus = "active" | "paused" | "completed";

const roleLabel: Record<Role, string> = { admin: "مدير", tasker: "موسِّم", qa: "مراجع جودة", user: "مستخدم" };
const roleBadgeColor: Record<Role, string> = {
  admin: "bg-red-100 text-red-700",
  tasker: "bg-amber-100 text-amber-700",
  qa: "bg-blue-100 text-blue-700",
  user: "bg-gray-100 text-gray-700",
};

const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string; dot: string; stripe: string }> = {
  active:    { label: "نشط",    color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", stripe: "bg-emerald-400" },
  paused:    { label: "موقوف",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-400",   stripe: "bg-amber-400"   },
  completed: { label: "مكتمل", color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       dot: "bg-blue-500",    stripe: "bg-blue-500"    },
};

const taskStatusLabel: Record<string, { label: string; color: string }> = {
  pending:     { label: "معلقة",   color: "text-gray-500 bg-gray-100"    },
  in_progress: { label: "جارية",   color: "text-blue-600 bg-blue-50"     },
  submitted:   { label: "مُسلَّمة", color: "text-amber-600 bg-amber-50"   },
  approved:    { label: "مقبولة",  color: "text-emerald-600 bg-emerald-50"},
  rejected:    { label: "مرفوضة", color: "text-red-600 bg-red-50"        },
};

const PAGE_SIZE = 50;

const TABS = [
  { id: "overview",    label: "📊 نظرة عامة"   },
  { id: "users",       label: "👥 المستخدمون"  },
  { id: "projects",    label: "📁 المشاريع"    },
  { id: "assign",      label: "🎯 تعيين المهام" },
  { id: "leaderboard", label: "🏆 المتصدرون"   },
  { id: "export",      label: "📤 تصدير"       },
] as const;
type Tab = typeof TABS[number]["id"];

// ─── Dataset Modal ────────────────────────────────────────────────────────────
function DatasetModal({ project, onClose, onRefetch }: { project: any; onClose: () => void; onRefetch: () => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [addTasksText, setAddTasksText] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);

  const { data: dataset, refetch: refetchDataset } = trpc.projects.getDataset.useQuery({
    projectId: project.id,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    statusFilter: statusFilter === "all" ? undefined : statusFilter,
  });

  const addTasks = trpc.projects.addTasks.useMutation({
    onSuccess: (r) => {
      toast.success(`✅ تم إضافة ${r.added} مهمة`);
      setAddTasksText(""); setShowAddForm(false);
      refetchDataset(); onRefetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = trpc.projects.deleteTask.useMutation({
    onSuccess: () => { toast.success("تم حذف المهمة"); setDeleteTaskId(null); refetchDataset(); },
    onError: (e) => toast.error(e.message),
  });

  const sc = dataset?.statusCounts;
  const totalPages = Math.ceil((dataset?.total ?? 0) / PAGE_SIZE);

  const statusBars = [
    { key: "pending",     label: "معلقة",   color: "#94A3B8", val: sc?.pending     ?? 0 },
    { key: "in_progress", label: "جارية",   color: "#38BDF8", val: sc?.in_progress ?? 0 },
    { key: "submitted",   label: "مُسلَّمة", color: "#F59E0B", val: sc?.submitted   ?? 0 },
    { key: "approved",    label: "مقبولة",  color: "#00D4A8", val: sc?.approved    ?? 0 },
    { key: "rejected",    label: "مرفوضة", color: "#EF4444", val: sc?.rejected    ?? 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-l from-slate-50 to-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Database size={20} className="text-primary" /> {project.name}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{project.description || "بيانات المشروع"}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><X size={20} /></button>
        </div>

        {/* Status filter bar */}
        <div className="px-6 py-4 border-b">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => { setStatusFilter("all"); setPage(0); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${statusFilter === "all" ? "bg-primary text-white border-primary" : "border-gray-200 hover:border-gray-300"}`}
            >
              الكل <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${statusFilter === "all" ? "bg-white/20" : "bg-gray-100 text-gray-700"}`}>{sc?.total ?? 0}</span>
            </button>
            {statusBars.map(s => (
              <button key={s.key}
                onClick={() => { setStatusFilter(statusFilter === s.key ? "all" : s.key); setPage(0); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${statusFilter === s.key ? "ring-2 ring-offset-1 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}
                style={statusFilter === s.key ? { borderColor: s.color, ringColor: s.color } : {}}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
                <span className="font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{s.val}</span>
              </button>
            ))}
          </div>
          {sc && sc.total > 0 && (
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden flex gap-px">
              {statusBars.filter(s => s.val > 0).map(s => (
                <div key={s.key} className="h-full" style={{ width: `${(s.val / sc.total) * 100}%`, background: s.color }} />
              ))}
            </div>
          )}
        </div>

        {/* Task table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {(dataset?.tasks.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Layers size={32} className="opacity-40" />
              <p className="text-sm">لا توجد مهام بهذا الفلتر</p>
            </div>
          ) : (
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">المحتوى</th>
                  <th className="px-3 py-2.5 font-medium">الحالة</th>
                  <th className="px-3 py-2.5 font-medium">المُعيَّن</th>
                  <th className="px-3 py-2.5 font-medium">GT</th>
                  <th className="px-3 py-2.5 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dataset?.tasks.map((t: any, i: number) => {
                  const st = taskStatusLabel[t.status] ?? { label: t.status, color: "text-gray-500 bg-gray-100" };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{page * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 max-w-xs"><p className="truncate font-medium text-gray-800">{t.content}</p></td>
                      <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span></td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{t.assigneeName ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5">{t.isGroundTruth ? <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">GT</span> : <span className="text-gray-200">—</span>}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setDeleteTaskId(t.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer: pagination + add */}
        <div className="px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(v => !v)} className="gap-1.5">
              <PlusCircle size={15} /> إضافة مهام
            </Button>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronRight size={16} /></Button>
                <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
                <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronLeft size={16} /></Button>
              </div>
            )}
          </div>
          <span className="text-xs text-gray-400">إجمالي {dataset?.total ?? 0} مهمة مع الفلتر الحالي</span>
        </div>

        {/* Add tasks inline form */}
        {showAddForm && (
          <div className="px-6 pb-5 border-t pt-4 bg-slate-50/50">
            <p className="text-sm font-medium mb-2">أضف مهام جديدة (جملة في كل سطر)</p>
            <textarea
              className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary h-24 font-mono bg-white"
              dir="rtl" placeholder={"الجملة الأولى\nالجملة الثانية\n..."}
              value={addTasksText} onChange={e => setAddTasksText(e.target.value)}
            />
            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" onClick={() => addTasks.mutate({ projectId: project.id, tasksText: addTasksText })} disabled={addTasks.isPending || !addTasksText.trim()}>
                {addTasks.isPending ? "جارٍ الإضافة..." : `إضافة ${addTasksText.split("\n").filter(s => s.trim()).length} مهمة`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>إلغاء</Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete task confirm dialog */}
      <Dialog open={deleteTaskId !== null} onOpenChange={() => setDeleteTaskId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف المهمة</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">هل أنت متأكد من حذف هذه المهمة وتوسيماتها؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTaskId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteTaskId && deleteTask.mutate({ taskId: deleteTaskId })} disabled={deleteTask.isPending}>
              {deleteTask.isPending ? "جارٍ..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onViewDataset, onEdit, onDelete, onRefetch }: {
  project: any; onViewDataset: () => void; onEdit: () => void; onDelete: () => void; onRefetch: () => void;
}) {
  const status: ProjectStatus = (project.status as ProjectStatus) ?? "active";
  const sc = statusConfig[status];
  const total = project.totalItems || 1;
  const progress = Math.round((project.completedItems / total) * 100);

  const updateStatus = trpc.projects.updateStatus.useMutation({
    onSuccess: () => { toast.success("تم تحديث حالة المشروع"); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });

  const nextAction: Record<ProjectStatus, { label: string; icon: any; next: ProjectStatus; cls: string }> = {
    active:    { label: "إيقاف مؤقت",   icon: Pause,      next: "paused",    cls: "text-amber-600 hover:bg-amber-50 border-amber-200"   },
    paused:    { label: "استئناف",       icon: Play,       next: "active",    cls: "text-emerald-600 hover:bg-emerald-50 border-emerald-200" },
    completed: { label: "إعادة تفعيل",  icon: RefreshCw,  next: "active",    cls: "text-blue-600 hover:bg-blue-50 border-blue-200"       },
  };
  const na = nextAction[status];

  return (
    <Card className="hover:shadow-md transition-all duration-200 border border-gray-200 overflow-hidden">
      <div className={`h-1 w-full ${sc.stripe}`} />
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-bold text-gray-900 truncate">{project.name}</CardTitle>
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{project.description || "لا يوجد وصف"}</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium whitespace-nowrap ${sc.bg} ${sc.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${status === "active" ? "animate-pulse" : ""}`} />
            {sc.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span className="font-medium">{progress}% مكتمل</span>
            <span>{project.completedItems?.toLocaleString("ar")} / {project.totalItems?.toLocaleString("ar")}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${sc.stripe}`} style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "مراجَعة",  val: project.reviewedItems ?? 0,  color: "text-blue-600"    },
            { label: "مكتملة",   val: project.completedItems ?? 0, color: "text-emerald-600" },
            { label: "إجمالي",   val: project.totalItems ?? 0,     color: "text-gray-600"    },
          ].map((s, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-2">
              <p className={`text-lg font-bold ${s.color}`}>{s.val.toLocaleString("ar")}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {project.annotationType && (
            <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full border border-violet-100">
              {project.annotationType === "classification" ? "تصنيف" :
               project.annotationType === "multi_classification" ? "تصنيف متعدد" :
               project.annotationType === "ner" ? "NER" :
               project.annotationType === "pairwise" ? "مقارنة" :
               project.annotationType === "html_interface" ? "🖥️ HTML" : project.annotationType}
            </span>
          )}
          {project.aiPreAnnotation  && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100">🤖 AI</span>}
          {project.spamDetection    && <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">🛡️ Spam</span>}
          {project.qaAiEnabled      && <span className="text-xs bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full border border-cyan-100">🔍 QA AI</span>}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" onClick={onViewDataset} className="flex-1 gap-1.5 text-xs">
            <Database size={13} /> الداتاست
          </Button>
          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: project.id, status: na.next })}
            disabled={updateStatus.isPending} className={`gap-1.5 text-xs ${na.cls}`} title={na.label}>
            <na.icon size={13} /> {na.label}
          </Button>
          {status !== "completed" && (
            <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: project.id, status: "completed" })}
              disabled={updateStatus.isPending} className="gap-1.5 text-xs text-blue-600 hover:bg-blue-50 border-blue-200" title="إنهاء المشروع">
              <CheckSquare size={13} />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} className="text-gray-400 hover:text-gray-700 p-1.5" title="تعديل"><Pencil size={14} /></Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5" title="حذف"><Trash2 size={14} /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStatus | "all">("all");
  const [datasetProject, setDatasetProject] = useState<any | null>(null);

  // Queries
  const { data: allUsers,    refetch: refetchUsers }    = trpc.admin.getAllUsers.useQuery();
  const { data: allProjects, refetch: refetchProjects } = trpc.projects.getAll.useQuery();
  const { data: adminStats  } = trpc.adminStats.get.useQuery();
  const { data: leaderboard } = trpc.leaderboard.get.useQuery();
  const [exportProjectId, setExportProjectId] = useState<number | null>(null);
  const { data: exportData } = trpc.export.projectAnnotations.useQuery(
    { projectId: exportProjectId! }, { enabled: exportProjectId !== null }
  );

  // Assign tab
  const [assignProjectId, setAssignProjectId] = useState<number | null>(null);
  const [assignUserId,    setAssignUserId]    = useState<number | null>(null);
  const [assignCount,     setAssignCount]     = useState(10);
  const { data: unassignedTasks } = trpc.taskManagement.getUnassigned.useQuery(
    { projectId: assignProjectId!, limit: 200 }, { enabled: assignProjectId !== null }
  );
  const assignTasks = trpc.taskManagement.assignTasks.useMutation({
    onSuccess: (r) => toast.success(`✅ تم تعيين ${r.assigned} مهمة بنجاح`),
    onError: (e) => toast.error(e.message),
  });

  // User mutations
  const createUser   = trpc.admin.createUser.useMutation();
  const bulkCreate   = trpc.admin.bulkCreateUsers.useMutation();
  const updateUser   = trpc.admin.updateUser.useMutation();
  const deleteUser   = trpc.admin.deleteUser.useMutation();
  const resetPw      = trpc.passwordManagement.resetPassword.useMutation();

  // Helper: invalidate projects cache globally so Tasker + Admin both update
  const utils = trpc.useUtils();
  const invalidateProjects = () => utils.projects.getAll.invalidate();

  // Project mutations
  const createProject = trpc.taskManagement.createProjectWithTasks.useMutation({
    onSuccess: () => { toast.success("✅ تم إنشاء المشروع"); invalidateProjects(); setShowProjectDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف المشروع"); invalidateProjects(); setDeleteProjectId(null); },
    onError: (e) => toast.error(e.message),
  });
  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => { toast.success("✅ تم التحديث"); invalidateProjects(); setShowEditProjectDialog(false); },
    onError: (e) => toast.error(e.message),
  });

  // Dialog state
  const [showCreateDialog,      setShowCreateDialog]      = useState(false);
  const [showBulkDialog,        setShowBulkDialog]        = useState(false);
  const [showEditDialog,        setShowEditDialog]        = useState(false);
  const [showDeleteConfirm,     setShowDeleteConfirm]     = useState<number | null>(null);
  const [showResetPwDialog,     setShowResetPwDialog]     = useState<{ id: number; name: string } | null>(null);
  const [showProjectDialog,     setShowProjectDialog]     = useState(false);
  const [showEditProjectDialog, setShowEditProjectDialog] = useState(false);
  const [editingProject,        setEditingProject]        = useState<any | null>(null);
  const [deleteProjectId,       setDeleteProjectId]       = useState<number | null>(null);
  const [selectedUser,          setSelectedUser]          = useState<any>(null);
  const [bulkResult,            setBulkResult]            = useState<any[] | null>(null);

  // Form state
  const [createForm,      setCreateForm]      = useState({ name: "", email: "", role: "tasker" as Role, password: "" });
  const [bulkForm,        setBulkForm]        = useState({ count: 5, role: "tasker" as "tasker" | "qa", prefix: "" });
  const [editForm,        setEditForm]        = useState({ name: "", email: "", role: "user" as Role, isActive: true });
  const [newPassword,     setNewPassword]     = useState("");
  const [projectForm,     setProjectForm]     = useState<any>({ name: "", description: "", tasksText: "", taskContents: [] as string[], annotationType: "classification", labelsRaw: "", instructions: "", minAnnotations: 1, aiPreAnnotation: false, qaAiEnabled: false, spamDetection: false });
  const [uploadMode, setUploadMode] = useState<"text" | "file">("text");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ name: "", description: "" });

  if (user?.role !== "admin") {
    return <ArabAnnotatorsDashboardLayout><div className="text-center py-12 text-red-600 font-semibold">ليس لديك صلاحية الوصول</div></ArabAnnotatorsDashboardLayout>;
  }

  // Filtered data
  const filteredUsers = useMemo(() =>
    allUsers?.filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())) ?? [],
    [allUsers, search]);

  const filteredProjects = useMemo(() => {
    let p = allProjects ?? [];
    if (projectStatusFilter !== "all") p = p.filter(pr => pr.status === projectStatusFilter);
    if (projectSearch.trim()) p = p.filter(pr => pr.name.toLowerCase().includes(projectSearch.toLowerCase()));
    return p;
  }, [allProjects, projectStatusFilter, projectSearch]);

  const taskers = allUsers?.filter(u => u.role === "tasker" && u.isActive) ?? [];

  // Handlers
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
    if (!showResetPwDialog || !newPassword || newPassword.length < 6) { toast.error("كلمة المرور قصيرة (6 أحرف+)"); return; }
    try { await resetPw.mutateAsync({ userId: showResetPwDialog.id, newPassword }); toast.success(`✅ تم تغيير كلمة مرور ${showResetPwDialog.name}`); setShowResetPwDialog(null); setNewPassword(""); }
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
  function downloadJSONL(data: any[], filename: string) {
    const blob = new Blob([data.map(r => JSON.stringify(r)).join("\n")], { type: "application/jsonlines" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }
  async function downloadXLSX(data: any[], filename: string) {
    // Build a simple CSV and rename to xlsx — or use SheetJS if available
    try {
      const { utils, writeFile } = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs" as any);
      const ws = utils.json_to_sheet(data);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Annotations");
      writeFile(wb, filename);
    } catch {
      // Fallback: download as CSV with .xlsx extension
      downloadCSV(data, filename.replace(".xlsx", ".csv"));
      toast.error("تعذّر توليد XLSX، تم تحميل CSV بدلاً منه");
    }
  }

  // ── File upload parsing ──────────────────────────────────────────────────────
  async function parseUploadedFile(file: File): Promise<string[]> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const text = await file.text();

    if (ext === "txt") {
      return text.split("\n").map(s => s.trim()).filter(Boolean);
    }
    if (ext === "jsonl") {
      return text.split("\n").map(s => s.trim()).filter(Boolean).map(line => {
        try { const o = JSON.parse(line); return typeof o === "string" ? o : (o.text ?? o.content ?? o.sentence ?? JSON.stringify(o)); }
        catch { return line; }
      });
    }
    if (ext === "json") {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.tasks ?? parsed.items ?? [];
      return arr.map((o: any) => typeof o === "string" ? o : (o.text ?? o.content ?? o.sentence ?? o.data ?? JSON.stringify(o)));
    }
    if (ext === "csv" || ext === "tsv") {
      const sep = ext === "tsv" ? "\t" : ",";
      const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
      if (!lines.length) return [];
      // Detect if first line is a header; look for a text/content/sentence column
      const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, "").toLowerCase());
      const textCol = ["text", "content", "sentence", "data", "نص", "جملة"].reduce((found, h) => found !== -1 ? found : headers.indexOf(h), -1);
      if (textCol !== -1) {
        return lines.slice(1).map(line => {
          const cols = line.split(sep);
          return (cols[textCol] ?? "").replace(/^"|"$/g, "").trim();
        }).filter(Boolean);
      }
      // No known header — treat first column as content, skip header row if it looks like text
      const firstIsHeader = isNaN(Number(lines[0].split(sep)[0]));
      return lines.slice(firstIsHeader ? 1 : 0).map(line => line.split(sep)[0].replace(/^"|"$/g, "").trim()).filter(Boolean);
    }
    if (ext === "xlsx" || ext === "xls") {
      try {
        const { read, utils } = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs" as any);
        const buf = await file.arrayBuffer();
        const wb = read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rows.length) return [];
        const headers = (rows[0] as string[]).map(h => String(h).toLowerCase());
        const textCol = ["text", "content", "sentence", "data", "نص", "جملة"].reduce((f, h) => f !== -1 ? f : headers.indexOf(h), -1);
        return rows.slice(1).map((r: any[]) => String(textCol !== -1 ? (r[textCol] ?? "") : (r[0] ?? "")).trim()).filter(Boolean);
      } catch {
        throw new Error("تعذّر قراءة ملف Excel. تأكد أن الملف سليم.");
      }
    }
    throw new Error(`صيغة الملف غير مدعومة: .${ext}`);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadFileName(file.name);
    try {
      const contents = await parseUploadedFile(file);
      if (!contents.length) { setUploadError("الملف فارغ أو لا يحتوي على بيانات قابلة للقراءة"); return; }
      setProjectForm((f: any) => ({ ...f, taskContents: contents, tasksText: "" }));
      toast.success(`✅ تم تحميل ${contents.length} عنصر من ${file.name}`);
    } catch (err: any) {
      setUploadError(err.message ?? "خطأ في قراءة الملف");
      setUploadFileName(null);
    }
    e.target.value = "";
  }
  async function handleCreateProject() {
    const labels = (projectForm.labelsRaw ?? "").split("\n").filter((s: string) => s.trim()).map((line: string) => {
      const parts = line.split(",");
      return { value: parts[0]?.trim() ?? "", color: parts[1]?.trim() ?? "#888", shortcut: parts[2]?.trim() };
    }).filter((l: any) => l.value);
    await createProject.mutateAsync({
      ...projectForm,
      labelsConfig: { labels },
      // Send parsed array when file was uploaded; otherwise send text for server-side split
      taskContents: projectForm.taskContents?.length ? projectForm.taskContents : undefined,
    });
    // Reset upload state after successful creation
    setUploadFileName(null);
    setUploadError(null);
    setUploadMode("text");
    setProjectForm((f: any) => ({ ...f, taskContents: [], tasksText: "" }));
  }

  // Chart data
  const roleDistribution = [
    { name: "موسِّمون",     value: allUsers?.filter(u => u.role === "tasker").length ?? 0 },
    { name: "مراجعو جودة", value: allUsers?.filter(u => u.role === "qa").length ?? 0    },
    { name: "مدراء",       value: allUsers?.filter(u => u.role === "admin").length ?? 0  },
  ].filter(d => d.value > 0);
  const annotationStatus = [
    { name: "معلقة",  value: adminStats?.pendingAnnotations ?? 0,  fill: "#F59E0B" },
    { name: "مقبولة", value: adminStats?.approvedAnnotations ?? 0, fill: "#00D4A8" },
    { name: "مرفوضة", value: adminStats?.rejectedAnnotations ?? 0, fill: "#EF4444" },
  ];
  const projectCounts = {
    active:    allProjects?.filter(p => p.status === "active").length ?? 0,
    paused:    allProjects?.filter(p => p.status === "paused").length ?? 0,
    completed: allProjects?.filter(p => p.status === "completed").length ?? 0,
  };

  return (
    <ArabAnnotatorsDashboardLayout title="لوحة التحكم">
      {datasetProject && (
        <DatasetModal project={datasetProject} onClose={() => setDatasetProject(null)} onRefetch={invalidateProjects} />
      )}

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

          {/* Project status summary */}
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
              <Button onClick={() => setShowBulkDialog(true)} variant="outline" size="sm" className="hidden sm:flex"><Plus size={16} className="ml-1" /> إنشاء دفعة</Button>
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

      {/* ── PROJECTS ── */}
      {tab === "projects" && (
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">المشاريع</h2>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(["all", "active", "paused", "completed"] as const).map(s => (
                  <button key={s} onClick={() => setProjectStatusFilter(s)}
                    className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${projectStatusFilter === s ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                    {s === "all" ? `الكل (${allProjects?.length ?? 0})` : `${statusConfig[s].label} (${projectCounts[s]})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="بحث في المشاريع..." value={projectSearch} onChange={e => setProjectSearch(e.target.value)} className="w-44 h-9 text-sm" />
              <Button onClick={() => setShowProjectDialog(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5" size="sm">
                <FolderPlus size={16} /> مشروع جديد
              </Button>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3 border-2 border-dashed border-gray-200 rounded-xl">
              <FileText size={36} className="opacity-30" />
              <p className="text-sm">لا توجد مشاريع</p>
              <Button size="sm" variant="outline" onClick={() => setShowProjectDialog(true)}>إنشاء أول مشروع</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map(p => (
                <ProjectCard key={p.id} project={p}
                  onViewDataset={() => setDatasetProject(p)}
                  onEdit={() => { setEditingProject(p); setEditProjectForm({ name: p.name, description: p.description ?? "" }); setShowEditProjectDialog(true); }}
                  onDelete={() => setDeleteProjectId(p.id)}
                  onRefetch={invalidateProjects}
                />
              ))}
            </div>
          )}
        </div>
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

              {exportData && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-center">
                  <p className="text-2xl font-bold text-amber-600">{exportData.length.toLocaleString("ar-EG")}</p>
                  <p className="text-xs text-amber-700 mt-0.5">توسيم جاهز للتصدير</p>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">صيغة التصدير</p>
                {[
                  { label: "CSV", icon: "📊", ext: "csv", fn: () => downloadCSV(exportData || [], `annotations_project_${exportProjectId}.csv`), desc: "Excel / Google Sheets" },
                  { label: "JSON", icon: "📋", ext: "json", fn: () => downloadJSON(exportData || [], `annotations_project_${exportProjectId}.json`), desc: "قاموس منسّق" },
                  { label: "JSONL", icon: "📄", ext: "jsonl", fn: () => downloadJSONL(exportData || [], `annotations_project_${exportProjectId}.jsonl`), desc: "سطر = عنصر (HuggingFace)" },
                  { label: "XLSX", icon: "🗂️", ext: "xlsx", fn: () => downloadXLSX(exportData || [], `annotations_project_${exportProjectId}.xlsx`), desc: "Excel مباشرة" },
                ].map(({ label, icon, fn, desc }) => (
                  <button
                    key={label}
                    disabled={!exportProjectId || !exportData?.length}
                    onClick={fn}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-right group"
                  >
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-amber-700">{label}</p>
                      <p className="text-xs text-slate-400">{desc}</p>
                    </div>
                    <Download size={14} className="text-slate-400 group-hover:text-amber-500 shrink-0" />
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">تصدير الداتاست الخام</p>
                <button
                  disabled={!exportProjectId}
                  onClick={async () => {
                    if (!exportProjectId) return;
                    // fetch dataset via existing getDataset endpoint
                    toast.info("جارٍ تحضير الداتاست...");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-slate-200 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-right group"
                >
                  <span className="text-lg">📦</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-600">المهام بدون توسيمات</p>
                    <p className="text-xs text-slate-400">للاستيراد في مشروع آخر</p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">معاينة البيانات</CardTitle>
                {exportData?.length ? <span className="text-xs text-slate-400">عرض أول 50 سجل من {exportData.length}</span> : null}
              </div>
            </CardHeader>
            <CardContent>
              {!exportProjectId
                ? <div className="h-52 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <span className="text-4xl">📂</span>
                    <p className="text-sm italic">اختر مشروعاً للمعاينة</p>
                  </div>
                : !exportData?.length
                  ? <div className="h-52 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <span className="text-4xl">🕊️</span>
                      <p className="text-sm italic">لا توجد توسيمات مكتملة بعد</p>
                    </div>
                  : <div className="max-h-96 overflow-y-auto text-xs rounded-lg border border-slate-100">
                      <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            {["المهمة", "التوسيم", "الموسِّم", "الجودة", "الوقت (ث)"].map(h => (
                              <th key={h} className="p-2 border border-slate-100 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {exportData.slice(0, 50).map((d: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="p-2 border border-slate-100 max-w-[180px] truncate text-slate-700">{d.content}</td>
                              <td className="p-2 border border-slate-100 font-mono text-slate-600 max-w-[120px] truncate">{JSON.stringify(d.annotationResult)}</td>
                              <td className="p-2 border border-slate-100 text-slate-600 whitespace-nowrap">{d.annotatorName}</td>
                              <td className="p-2 border border-slate-100 whitespace-nowrap">
                                {d.qaStatus
                                  ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.qaStatus === "approved" ? "bg-green-100 text-green-700" : d.qaStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                                      {d.qaStatus === "approved" ? "مقبول" : d.qaStatus === "rejected" ? "مرفوض" : "مراجعة"}
                                    </span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="p-2 border border-slate-100 text-slate-500">{d.timeSpentSeconds ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
              }
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
            <div><label className="text-sm font-medium">الاسم الكامل</label><Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="أحمد علي" className="mt-1" /></div>
            <div><label className="text-sm font-medium">البريد الإلكتروني</label><Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmed@example.com" className="mt-1" /></div>
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
            <Button onClick={handleCreateUser} disabled={createUser.isPending}>{createUser.isPending ? "جارٍ..." : "إنشاء"}</Button>
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
                className={`px-3 py-1 rounded-full text-xs font-medium ${editForm.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
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
            <Button onClick={handleResetPassword} disabled={resetPw.isPending} className="bg-amber-500 hover:bg-amber-600">
              {resetPw.isPending ? "جارٍ..." : "تغيير"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Project */}
      <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📁 إنشاء مشروع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-sm font-medium">اسم المشروع *</label><Input value={projectForm.name} onChange={e => setProjectForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="مثال: تصنيف الجمل" className="mt-1" /></div>
              <div className="col-span-2"><label className="text-sm font-medium">الوصف</label><Input value={projectForm.description} onChange={e => setProjectForm((f: any) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-700">🏷️ إعدادات التوسيم</h3>
              <div>
                <label className="text-sm font-medium">نوع التوسيم</label>
                <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" value={projectForm.annotationType} onChange={e => setProjectForm((f: any) => ({ ...f, annotationType: e.target.value }))}>
                  <option value="classification">تصنيف نصي (اختيار واحد)</option>
                  <option value="multi_classification">تصنيف متعدد</option>
                  <option value="ner">تحديد كيانات (NER)</option>
                  <option value="pairwise">مقارنة نصين</option>
                  <option value="relations">علاقات بين كيانات</option>
                  <option value="html_interface">🖥️ واجهة HTML مخصصة</option>
                </select>
              </div>
              {projectForm.annotationType === "html_interface" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">🖥️ كود HTML الواجهة *</label>
                    <span className="text-[11px] text-slate-400">الواجهة ستُعرض للتاسكر بدلاً من الويدجت الافتراضي</span>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-[#0D1117]">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#161b22]">
                      <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500/60"/><div className="w-3 h-3 rounded-full bg-amber-500/60"/><div className="w-3 h-3 rounded-full bg-green-500/60"/></div>
                      <span className="text-[11px] text-slate-500 font-mono mr-2">interface.html</span>
                    </div>
                    <textarea
                      value={projectForm.instructions}
                      onChange={e => setProjectForm((f: any) => ({ ...f, instructions: e.target.value }))}
                      spellCheck={false}
                      className="w-full bg-transparent text-slate-200 font-mono text-[12px] leading-6 p-4 resize-none h-48 outline-none border-0"
                      style={{ direction: "ltr", textAlign: "left", tabSize: 2 }}
                      placeholder={"<!DOCTYPE html>\n<html lang=\"ar\" dir=\"rtl\">\n<head><meta charset=\"UTF-8\"></head>\n<body>\n  <!-- واجهتك هنا -->\n  <script>\n    // أرسل النتيجة هكذا:\n    // window.parent.postMessage({ type: 'annotation_result', result: { label: 'اختيارك' } }, '*');\n  </script>\n</body>\n</html>"}
                    />
                  </div>
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    💡 لإرسال نتيجة التوسيم، أضف هذا الكود في HTML: <code className="font-mono bg-amber-100 px-1 rounded">window.parent.postMessage(&#123; type: 'annotation_result', result: &#123; label: '...' &#125; &#125;, '*')</code>
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium">التصنيفات</label>
                    <p className="text-xs text-slate-400 mb-1">كل سطر: الاسم,اللون,الاختصار — مثال: إيجابي,#00D4A8,1</p>
                    <textarea className="w-full border border-slate-200 rounded-lg p-3 text-sm font-mono resize-none h-20 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder={"إيجابي,#00D4A8,1\nسلبي,#EF4444,2\nمحايد,#94A3B8,3"} value={projectForm.labelsRaw} onChange={e => setProjectForm((f: any) => ({ ...f, labelsRaw: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">تعليمات التوسيم</label>
                    <textarea className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none h-16 bg-white mt-1 focus:outline-none focus:ring-2 focus:ring-amber-400" dir="rtl" placeholder="اقرأ النص وصنِّفه..." value={projectForm.instructions} onChange={e => setProjectForm((f: any) => ({ ...f, instructions: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="number" min={1} max={10} className="w-12 border border-slate-200 rounded px-2 py-1 text-sm text-center" value={projectForm.minAnnotations} onChange={e => setProjectForm((f: any) => ({ ...f, minAnnotations: Number(e.target.value) }))} />
                  توسيمات مطلوبة
                </label>
                {[["aiPreAnnotation","🤖 AI"],["qaAiEnabled","🔍 QA AI"],["spamDetection","🛡️ Spam"]].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={(projectForm as any)[k]} onChange={e => setProjectForm((f: any) => ({ ...f, [k]: e.target.checked }))} className="rounded" />
                    <span className="text-slate-600">{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">📂 بيانات المشروع *</h3>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => { setUploadMode("text"); setUploadFileName(null); setUploadError(null); setProjectForm((f: any) => ({ ...f, taskContents: [] })); }}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${uploadMode === "text" ? "bg-white shadow text-amber-600" : "text-slate-500 hover:text-slate-700"}`}
                  >✏️ إدخال يدوي</button>
                  <button
                    onClick={() => setUploadMode("file")}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${uploadMode === "file" ? "bg-white shadow text-amber-600" : "text-slate-500 hover:text-slate-700"}`}
                  >📤 رفع ملف</button>
                </div>
              </div>

              {uploadMode === "text" ? (
                <div>
                  <textarea
                    value={projectForm.tasksText}
                    onChange={e => setProjectForm((f: any) => ({ ...f, tasksText: e.target.value, taskContents: [] }))}
                    placeholder={"الجملة الأولى\nالجملة الثانية\n..."}
                    className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none h-36 font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    dir="rtl"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {projectForm.tasksText.split("\n").filter((s: string) => s.trim()).length} عنصر
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Drop zone */}
                  <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all
                    ${uploadFileName ? "border-green-400 bg-green-50" : "border-slate-300 bg-slate-50 hover:border-amber-400 hover:bg-amber-50/30"}`}>
                    <input type="file" className="hidden" accept=".txt,.json,.jsonl,.csv,.tsv,.xlsx,.xls" onChange={handleFileUpload} />
                    {uploadFileName ? (
                      <div className="text-center">
                        <div className="text-2xl mb-1">✅</div>
                        <p className="text-sm font-medium text-green-700">{uploadFileName}</p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {(projectForm.taskContents?.length ?? 0).toLocaleString("ar-EG")} عنصر جاهز
                        </p>
                        <p className="text-xs text-slate-400 mt-1">انقر لاختيار ملف آخر</p>
                      </div>
                    ) : (
                      <div className="text-center px-4">
                        <div className="text-3xl mb-2">📁</div>
                        <p className="text-sm font-medium text-slate-600">اسحب الملف هنا أو انقر للاختيار</p>
                        <p className="text-xs text-slate-400 mt-1">يدعم: TXT · JSON · JSONL · CSV · TSV · XLSX · XLS</p>
                      </div>
                    )}
                  </label>

                  {/* Error */}
                  {uploadError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <span>⚠️</span>
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {/* Format guide */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { fmt: "TXT", desc: "سطر = عنصر" },
                      { fmt: "CSV/TSV", desc: "عمود text/content/sentence" },
                      { fmt: "JSON", desc: "array أو {data:[], tasks:[]}" },
                      { fmt: "JSONL", desc: "كل سطر object بحقل text" },
                      { fmt: "XLSX/XLS", desc: "ورقة أولى، عمود text" },
                    ].map(({ fmt, desc }) => (
                      <div key={fmt} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="font-mono font-bold text-amber-600 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded">{fmt}</span>
                        <span className="text-slate-500">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectDialog(false)}>إلغاء</Button>
            <Button
              onClick={handleCreateProject}
              disabled={
                createProject.isPending ||
                !projectForm.name ||
                (uploadMode === "text" ? !projectForm.tasksText.trim() : !projectForm.taskContents?.length)
              }
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {createProject.isPending ? "جارٍ الإنشاء..." : `إنشاء المشروع${projectForm.taskContents?.length ? ` (${projectForm.taskContents.length.toLocaleString("ar-EG")} عنصر)` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project */}
      <Dialog open={showEditProjectDialog} onOpenChange={setShowEditProjectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>✏️ تعديل المشروع</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium">اسم المشروع</label><Input value={editProjectForm.name} onChange={e => setEditProjectForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-sm font-medium">الوصف</label><Input value={editProjectForm.description} onChange={e => setEditProjectForm(f => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditProjectDialog(false)}>إلغاء</Button>
            <Button onClick={() => editingProject && updateProjectMutation.mutate({ id: editingProject.id, ...editProjectForm })} disabled={updateProjectMutation.isPending || !editProjectForm.name}>
              {updateProjectMutation.isPending ? "جارٍ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project */}
      <Dialog open={deleteProjectId !== null} onOpenChange={() => setDeleteProjectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle size={18} /> حذف المشروع</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">سيتم حذف المشروع وجميع مهامه وتوسيماته نهائياً. لا يمكن التراجع.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteProjectId && deleteProjectMutation.mutate({ id: deleteProjectId })} disabled={deleteProjectMutation.isPending}>
              {deleteProjectMutation.isPending ? "جارٍ الحذف..." : "حذف نهائياً"}
            </Button>
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
            <Button variant="destructive" onClick={() => showDeleteConfirm && handleDeleteUser(showDeleteConfirm)} disabled={deleteUser.isPending}>
              {deleteUser.isPending ? "جارٍ..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ArabAnnotatorsDashboardLayout>
  );
}
