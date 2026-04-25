import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import {
  Play, Pause, CheckSquare, FolderPlus, AlertTriangle, RefreshCw,
  FileText, Layers, Clock, CheckCircle2, TrendingUp, Download, FileJson, Sheet,
  Pencil, Trash2, Upload, ChevronLeft, Search, Info
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type ProjectStatus = "active" | "paused" | "completed";

const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string; dot: string }> = {
  active:    { label: "نشط",    color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  paused:    { label: "موقوف",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-400"   },
  completed: { label: "مكتمل",  color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",      dot: "bg-blue-500"    },
};

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Queries
  const { data: projects = [], isLoading } = trpc.projects.getAll.useQuery();
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Mutations
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => { toast.success("تم تحديث المشروع"); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف المشروع"); setSelectedProjectId(null); queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });

  const addTasks = trpc.projects.addTasks.useMutation({
    onSuccess: (data) => { toast.success(`تم إضافة ${data.count} مهمة بنجاح`); queryClient.invalidateQueries(); setIsUploading(false); },
    onError: (e) => toast.error(e.message),
  });

  // Handlers
  const handleStatusChange = (id: number, status: ProjectStatus) => updateProject.mutate({ id, status });
  const handleDelete = (id: number) => { if (confirm("هل أنت متأكد من حذف المشروع وجميع بياناته؟")) deleteProject.mutate({ id }); };

  const exportData = async (format: "json" | "csv" | "xlsx" | "txt") => {
    if (!selectedProject) return;
    toast.info("جاري تحضير البيانات للتصدير...");
    // Note: In a real app, this would call an API. For now, we simulate with project info.
    const data = { project: selectedProject, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project_${selectedProject.id}_export.${format}`;
    a.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId) return;
    setIsUploading(true);
    try {
      const text = await file.text();
      const tasks = text.split("\n").map(s => s.trim()).filter(Boolean);
      if (tasks.length > 0) {
        addTasks.mutate({ projectId: selectedProjectId, taskContents: tasks });
      } else {
        toast.error("الملف فارغ");
        setIsUploading(false);
      }
    } catch (err) {
      toast.error("خطأ في قراءة الملف");
      setIsUploading(false);
    }
    e.target.value = "";
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <ArabAnnotatorsDashboardLayout title="إدارة المشاريع">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📁 إدارة المشاريع</h1>
            <p className="text-slate-500">عرض وتعديل وإدارة بيانات المشاريع</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input 
                placeholder="بحث عن مشروع..." 
                className="pr-10 w-64" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
            <Button onClick={() => window.location.href = "/admin/projects/create"} className="gap-2">
              <FolderPlus size={18} /> مشروع جديد
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Projects List */}
          <div className={`lg:col-span-1 space-y-3 ${selectedProjectId ? "hidden lg:block" : "block"}`}>
            {isLoading ? (
              <div className="flex justify-center p-10"><RefreshCw className="animate-spin text-primary" /></div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center p-10 bg-slate-50 rounded-xl border border-dashed">لا توجد مشاريع</div>
            ) : (
              filteredProjects.map(p => (
                <Card 
                  key={p.id} 
                  className={`cursor-pointer transition-all hover:shadow-md border-2 ${selectedProjectId === p.id ? "border-primary bg-primary/5" : "border-transparent"}`}
                  onClick={() => setSelectedProjectId(p.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <Badge className={statusConfig[p.status as ProjectStatus].bg + " " + statusConfig[p.status as ProjectStatus].color}>
                        {statusConfig[p.status as ProjectStatus].label}
                      </Badge>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock size={10} /> {new Date(p.createdAt).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-800 truncate">{p.name}</h3>
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Layers size={12} /> {p.annotationType}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Project Details (The "All-in-One" View) */}
          <div className={`lg:col-span-2 ${!selectedProjectId ? "hidden lg:flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 h-[400px]" : "block"}`}>
            {!selectedProject ? (
              <div className="text-center text-slate-400">
                <Info size={48} className="mx-auto mb-3 opacity-20" />
                <p>اختر مشروعاً من القائمة لعرض التفاصيل والإدارة</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                {/* Back button for mobile */}
                <Button variant="ghost" size="sm" className="lg:hidden mb-2" onClick={() => setSelectedProjectId(null)}>
                  <ChevronLeft size={16} /> عودة للقائمة
                </Button>

                {/* Main Info Card */}
                <Card className="overflow-hidden border-slate-200 shadow-sm">
                  <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${statusConfig[selectedProject.status as ProjectStatus].dot}`} />
                      <CardTitle className="text-xl">{selectedProject.name}</CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleStatusChange(selectedProject.id, selectedProject.status === "active" ? "paused" : "active")}>
                        {selectedProject.status === "active" ? <Pause size={14} className="ml-1" /> : <Play size={14} className="ml-1" />}
                        {selectedProject.status === "active" ? "إيقاف" : "تنشيط"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedProject.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-xs text-blue-600 mb-1">نوع التوسيم</p>
                        <p className="font-bold text-blue-900">{selectedProject.annotationType}</p>
                      </div>
                      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <p className="text-xs text-emerald-600 mb-1">تاريخ الإنشاء</p>
                        <p className="font-bold text-emerald-900">{new Date(selectedProject.createdAt).toLocaleDateString("ar-EG")}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-xs text-slate-600 mb-1">الحالة الحالية</p>
                        <p className="font-bold text-slate-900">{statusConfig[selectedProject.status as ProjectStatus].label}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {/* Upload Section */}
                      <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <Upload size={18} className="text-primary" /> إضافة مهام جديدة (رفع داتا سيت)
                        </h3>
                        <div className="flex flex-col md:flex-row items-center gap-4">
                          <div className="flex-1">
                            <p className="text-sm text-slate-500 mb-2">يمكنك رفع ملفات TXT, CSV, XLSX لإضافة مهام جديدة لهذا المشروع فوراً.</p>
                            <div className="flex gap-2">
                              <Badge variant="outline">TXT</Badge>
                              <Badge variant="outline">CSV</Badge>
                              <Badge variant="outline">XLSX</Badge>
                              <Badge variant="outline">JSON</Badge>
                            </div>
                          </div>
                          <div className="relative">
                            <input type="file" id="project-upload" className="hidden" onChange={handleFileUpload} accept=".txt,.csv,.xlsx,.json" />
                            <Button asChild disabled={isUploading}>
                              <label htmlFor="project-upload" className="cursor-pointer">
                                {isUploading ? <RefreshCw className="animate-spin ml-2" size={16} /> : <Upload className="ml-2" size={16} />}
                                {isUploading ? "جاري الرفع..." : "رفع ملف الآن"}
                              </label>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Export Section */}
                      <div className="p-6 border border-slate-200 rounded-2xl">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <Download size={18} className="text-primary" /> تصدير بيانات المشروع
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <Button variant="outline" className="gap-2" onClick={() => exportData("json")}>
                            <FileJson size={16} /> JSON
                          </Button>
                          <Button variant="outline" className="gap-2" onClick={() => exportData("csv")}>
                            <Sheet size={16} /> CSV
                          </Button>
                          <Button variant="outline" className="gap-2" onClick={() => exportData("xlsx")}>
                            <Sheet size={16} /> XLSX
                          </Button>
                          <Button variant="outline" className="gap-2" onClick={() => exportData("txt")}>
                            <FileText size={16} /> TXT
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
