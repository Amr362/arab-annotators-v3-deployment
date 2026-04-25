import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Database, X,
  Play, Pause, CheckSquare, FolderPlus, AlertTriangle, RefreshCw,
  FileText, Layers, Clock, CheckCircle2, TrendingUp, Download, FileJson, Sheet,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

type ProjectStatus = "active" | "paused" | "completed";

const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string; dot: string }> = {
  active:    { label: "نشط",    color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  paused:    { label: "موقوف",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-400"   },
  completed: { label: "مكتمل", color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       dot: "bg-blue-500"    },
};

const PAGE_SIZE = 50;

export default function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Fetch all projects
  const { data: allProjects, isLoading, refetch: refetchProjects } = trpc.projects.getAll.useQuery();

  // Fetch project details (dataset info)
  const { data: projectDetails } = trpc.projects.getDataset.useQuery(
    { projectId: selectedProjectId ?? 0, limit: 1, offset: 0 },
    { enabled: selectedProjectId !== null }
  );

  // Mutations
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث المشروع");
      setShowEditModal(false);
      refetchProjects();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.projects.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث حالة المشروع");
      refetchProjects();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المشروع");
      setDeleteProjectId(null);
      setShowDetailsModal(false);
      refetchProjects();
    },
    onError: (e) => toast.error(e.message),
  });

  // Filter projects
  const filteredProjects = useMemo(() => {
    if (!allProjects) return [];
    return allProjects.filter(p =>
      p.name.includes(search) || p.description?.includes(search)
    );
  }, [allProjects, search]);

  const selectedProject = allProjects?.find(p => p.id === selectedProjectId);

  const handleEdit = () => {
    if (!selectedProject) return;
    setEditForm({ name: selectedProject.name, description: selectedProject.description ?? "" });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!selectedProjectId || !editForm.name.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    updateProject.mutate({
      id: selectedProjectId,
      name: editForm.name.trim(),
      description: editForm.description.trim(),
    });
  };

  const handleStatusChange = (status: ProjectStatus) => {
    if (!selectedProjectId) return;
    updateStatus.mutate({ id: selectedProjectId, status });
  };

  const handleDeleteConfirm = () => {
    if (!deleteProjectId) return;
    deleteProject.mutate({ id: deleteProjectId });
  };

  const exportProjectData = async (format: "json" | "csv" | "xlsx" | "txt") => {
    if (!selectedProject || !projectDetails) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    try {
      const tasks = projectDetails.tasks || [];
      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === "json") {
        content = JSON.stringify({
          project: {
            id: selectedProject.id,
            name: selectedProject.name,
            description: selectedProject.description,
            annotationType: selectedProject.annotationType,
            status: selectedProject.status,
            createdAt: selectedProject.createdAt,
          },
          tasks: tasks.map(t => ({ id: t.id, content: t.content, status: t.status })),
        }, null, 2);
        filename = `${selectedProject.name}_${new Date().toISOString().split("T")[0]}.json`;
        mimeType = "application/json";
      } else if (format === "csv") {
        const rows = [
          ["معرف", "المحتوى", "الحالة"],
          ...tasks.map(t => [t.id, `"${t.content.replace(/"/g, '""')}"`, t.status]),
        ];
        content = rows.map(r => r.join(",")).join("\n");
        filename = `${selectedProject.name}_${new Date().toISOString().split("T")[0]}.csv`;
        mimeType = "text/csv;charset=utf-8";
      } else if (format === "txt") {
        content = tasks.map(t => t.content).join("\n");
        filename = `${selectedProject.name}_${new Date().toISOString().split("T")[0]}.txt`;
        mimeType = "text/plain;charset=utf-8";
      } else {
        // XLSX format - export as tab-separated for Excel
        const rows = [
          ["معرف", "المحتوى", "الحالة"],
          ...tasks.map(t => [t.id, t.content, t.status]),
        ];
        content = rows.map(r => r.join("\t")).join("\n");
        filename = `${selectedProject.name}_${new Date().toISOString().split("T")[0]}.xlsx`;
        mimeType = "application/vnd.ms-excel;charset=utf-8";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`تم تصدير البيانات بصيغة ${format.toUpperCase()}`);
      setShowExportMenu(false);
    } catch (err: any) {
      toast.error("خطأ في التصدير: " + err.message);
    }
  };

  if (user?.role !== "admin") {
    return (
      <ArabAnnotatorsDashboardLayout title="المشاريع">
        <div className="flex items-center justify-center h-64 text-red-500 font-semibold">
          ليس لديك صلاحية الوصول
        </div>
      </ArabAnnotatorsDashboardLayout>
    );
  }

  return (
    <ArabAnnotatorsDashboardLayout title="إدارة المشاريع">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">المشاريع</h1>
          <Button asChild className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5" size="sm">
            <a href="/admin">
              <FolderPlus size={16} /> مشروع جديد
            </a>
          </Button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="بحث في المشاريع..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" size="sm" onClick={() => refetchProjects()}>
            <RefreshCw size={14} /> تحديث
          </Button>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-slate-400">جاري التحميل...</div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
              <FileText size={36} className="opacity-30" />
              <p className="text-sm">لا توجد مشاريع</p>
              <Button size="sm" variant="outline" asChild>
                <a href="/admin">إنشاء أول مشروع</a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(project => {
              const sc = statusConfig[project.status as ProjectStatus];
              const progress = project.totalItems > 0 ? (project.completedItems / project.totalItems) * 100 : 0;

              return (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setShowDetailsModal(true);
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{project.name}</CardTitle>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{project.description || "بدون وصف"}</p>
                      </div>
                      <Badge className={`flex-shrink-0 ${sc.bg} ${sc.color} border`}>
                        {sc.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">التقدم</span>
                        <span className="font-semibold text-slate-700">{Math.round(progress)}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-50 rounded p-2 text-center">
                        <div className="font-bold text-slate-800">{project.totalItems}</div>
                        <div className="text-slate-500">إجمالي</div>
                      </div>
                      <div className="bg-emerald-50 rounded p-2 text-center">
                        <div className="font-bold text-emerald-700">{project.completedItems}</div>
                        <div className="text-emerald-600">مكتملة</div>
                      </div>
                      <div className="bg-blue-50 rounded p-2 text-center">
                        <div className="font-bold text-blue-700">{project.reviewedItems ?? 0}</div>
                        <div className="text-blue-600">مراجعة</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedProject && (
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database size={20} className="text-primary" />
                {selectedProject.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Description */}
              <div>
                <label className="text-sm font-medium text-slate-600">الوصف</label>
                <p className="text-sm text-slate-700 mt-1">{selectedProject.description || "بدون وصف"}</p>
              </div>

              {/* Status */}
              <div>
                <label className="text-sm font-medium text-slate-600 mb-2 block">الحالة</label>
                <div className="flex gap-2">
                  {(["active", "paused", "completed"] as const).map(status => {
                    const sc = statusConfig[status];
                    return (
                      <Button
                        key={status}
                        variant={selectedProject.status === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusChange(status)}
                        disabled={updateStatus.isPending}
                      >
                        {status === "active" && <Play size={14} className="ml-1" />}
                        {status === "paused" && <Pause size={14} className="ml-1" />}
                        {status === "completed" && <CheckSquare size={14} className="ml-1" />}
                        {sc.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-800">{selectedProject.totalItems}</div>
                  <div className="text-xs text-slate-500 mt-1">إجمالي المهام</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{selectedProject.completedItems}</div>
                  <div className="text-xs text-emerald-600 mt-1">مكتملة</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{selectedProject.reviewedItems ?? 0}</div>
                  <div className="text-xs text-blue-600 mt-1">مراجعة</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">
                    {selectedProject.totalItems > 0 ? Math.round((selectedProject.completedItems / selectedProject.totalItems) * 100) : 0}%
                  </div>
                  <div className="text-xs text-amber-600 mt-1">التقدم</div>
                </div>
              </div>

              {/* Annotation Type */}
              {selectedProject.annotationType && (
                <div>
                  <label className="text-sm font-medium text-slate-600">نوع التوسيم</label>
                  <p className="text-sm text-slate-700 mt-1 bg-slate-50 p-2 rounded">{selectedProject.annotationType}</p>
                </div>
              )}

              {/* Created info */}
              <div className="text-xs text-slate-500 space-y-1">
                <p>تم الإنشاء: {new Date(selectedProject.createdAt).toLocaleString("ar-SA")}</p>
                <p>آخر تحديث: {new Date(selectedProject.updatedAt).toLocaleString("ar-SA")}</p>
              </div>
            </div>

            <DialogFooter className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                إغلاق
              </Button>
              <div className="flex gap-2">
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="gap-1.5"
                  >
                    <Download size={14} /> تصدير
                  </Button>
                  {showExportMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-max">
                      <button
                        onClick={() => exportProjectData("json")}
                        className="w-full text-right px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm"
                      >
                        <FileJson size={14} /> JSON
                      </button>
                      <button
                        onClick={() => exportProjectData("csv")}
                        className="w-full text-right px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm border-t"
                      >
                        <Sheet size={14} /> CSV
                      </button>
                      <button
                        onClick={() => exportProjectData("xlsx")}
                        className="w-full text-right px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm border-t"
                      >
                        <Sheet size={14} /> XLSX
                      </button>
                      <button
                        onClick={() => exportProjectData("txt")}
                        className="w-full text-right px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm border-t"
                      >
                        <FileText size={14} /> TXT
                      </button>
                    </div>
                  )}
                </div>
                <Button variant="outline" onClick={handleEdit}>
                  <Pencil size={14} className="ml-1" /> تعديل
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDeleteProjectId(selectedProject.id);
                    setShowDetailsModal(false);
                  }}
                >
                  <Trash2 size={14} className="ml-1" /> حذف
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Modal */}
      {selectedProject && (
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تعديل المشروع</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">الاسم</label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">الوصف</label>
                <Input
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1"
                  placeholder="اختياري"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateProject.isPending}>
                {updateProject.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {deleteProjectId && (
        <Dialog open={!!deleteProjectId} onOpenChange={v => !v && setDeleteProjectId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle size={20} /> تأكيد الحذف
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-slate-600">
              هل أنت متأكد من رغبتك في حذف هذا المشروع؟ سيتم حذف جميع المهام والتوسيمات المرتبطة به.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteProjectId(null)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteProject.isPending}
              >
                {deleteProject.isPending ? "جاري الحذف..." : "تأكيد الحذف"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ArabAnnotatorsDashboardLayout>
  );
}
