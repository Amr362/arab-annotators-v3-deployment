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
import { useState } from "react";
import { Upload, Plus, X, AlertCircle, CheckCircle2, FileText, FileJson, Sheet, File } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

type UploadMode = "text" | "file";

const ANNOTATION_TYPES = [
  { value: "classification", label: "تصنيف نصي" },
  { value: "multi_classification", label: "تصنيف متعدد" },
  { value: "ner", label: "تحديد كيانات" },
  { value: "pairwise", label: "مقارنة نصين" },
  { value: "relations", label: "علاقات" },
  { value: "html_interface", label: "واجهة تفاعلية" },
];

export default function CreateProjectPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    tasksText: "",
    taskContents: [] as string[],
    annotationType: "classification",
    labelsRaw: "إيجابي,#10B981,1\nسلبي,#EF4444,2\nمحايد,#94A3B8,3",
    instructions: "",
    minAnnotations: 1,
    aiPreAnnotation: false,
    qaAiEnabled: false,
    spamDetection: false,
  });

  const [uploadMode, setUploadMode] = useState<UploadMode>("text");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const createProject = trpc.projects.createProjectWithTasks.useMutation({
    onSuccess: (result) => {
      toast.success(`✅ تم إنشاء المشروع: ${result?.name} (${result?.taskCount} مهمة)`);
      setProjectForm({
        name: "",
        description: "",
        tasksText: "",
        taskContents: [],
        annotationType: "classification",
        labelsRaw: "إيجابي,#10B981,1\nسلبي,#EF4444,2\nمحايد,#94A3B8,3",
        instructions: "",
        minAnnotations: 1,
        aiPreAnnotation: false,
        qaAiEnabled: false,
        spamDetection: false,
      });
      setUploadFileName(null);
      setUploadError(null);
      setUploadMode("text");
      queryClient.invalidateQueries({ queryKey: ["projects", "getAll"] });
      setTimeout(() => setLocation("/admin/projects"), 1500);
    },
    onError: (e) => toast.error(e.message),
  });

  async function parseUploadedFile(file: File): Promise<string[]> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const text = await file.text();

    if (ext === "txt") {
      return text.split("\n").map(s => s.trim()).filter(Boolean);
    }
    if (ext === "jsonl") {
      return text.split("\n").map(s => s.trim()).filter(Boolean).map(line => {
        try {
          const o = JSON.parse(line);
          return typeof o === "string" ? o : (o.text ?? o.content ?? o.sentence ?? JSON.stringify(o));
        } catch {
          return line;
        }
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
      const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, "").toLowerCase());
      const textCol = ["text", "content", "sentence", "data", "نص", "جملة"].reduce((found, h) => found !== -1 ? found : headers.indexOf(h), -1);
      if (textCol !== -1) {
        return lines.slice(1).map(line => {
          const cols = line.split(sep);
          return (cols[textCol] ?? "").replace(/^"|"$/g, "").trim();
        }).filter(Boolean);
      }
      const firstIsHeader = isNaN(Number(lines[0].split(sep)[0]));
      return lines.slice(firstIsHeader ? 1 : 0).map(line => line.split(sep)[0].replace(/^"|"$/g, "").trim()).filter(Boolean);
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
      if (!contents.length) {
        setUploadError("الملف فارغ أو لا يحتوي على بيانات قابلة للقراءة");
        return;
      }
      setProjectForm((f) => ({ ...f, taskContents: contents, tasksText: "" }));
      toast.success(`✅ تم تحميل ${contents.length} عنصر من ${file.name}`);
    } catch (err: any) {
      setUploadError(err.message ?? "خطأ في قراءة الملف");
      setUploadFileName(null);
    }
    e.target.value = "";
  }

  async function handleCreateProject() {
    if (!projectForm.name.trim()) {
      toast.error("أدخل اسم المشروع");
      return;
    }

    const labels = (projectForm.labelsRaw ?? "").split("\n").filter((s: string) => s.trim()).map((line: string) => {
      const parts = line.split(",");
      return { value: parts[0]?.trim() ?? "", color: parts[1]?.trim() ?? "#888", shortcut: parts[2]?.trim() };
    }).filter((l: any) => l.value);

    await createProject.mutateAsync({
      name: projectForm.name.trim(),
      description: projectForm.description.trim(),
      labelsConfig: { labels },
      taskContents: projectForm.taskContents?.length ? projectForm.taskContents : undefined,
      tasksText: projectForm.taskContents?.length ? undefined : projectForm.tasksText,
      annotationType: projectForm.annotationType,
      instructions: projectForm.instructions || undefined,
      minAnnotations: projectForm.minAnnotations,
      aiPreAnnotation: projectForm.aiPreAnnotation,
      qaAiEnabled: projectForm.qaAiEnabled,
      spamDetection: projectForm.spamDetection,
    });
  }

  if (user?.role !== "admin") {
    return (
      <ArabAnnotatorsDashboardLayout title="إنشاء مشروع">
        <div className="flex items-center justify-center h-64 text-red-500 font-semibold">
          ليس لديك صلاحية الوصول
        </div>
      </ArabAnnotatorsDashboardLayout>
    );
  }

  const taskCount = projectForm.taskContents?.length || projectForm.tasksText.split("\n").filter(s => s.trim()).length || 0;

  return (
    <ArabAnnotatorsDashboardLayout title="إنشاء مشروع جديد">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مشروع جديد</h1>
          <p className="text-slate-500 mt-1">أنشئ مشروع توسيم جديد وأضف المهام</p>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">معلومات المشروع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">اسم المشروع *</label>
                  <Input
                    value={projectForm.name}
                    onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="مثال: توسيم الأمثال العربية"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">الوصف</label>
                  <Input
                    value={projectForm.description}
                    onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="وصف اختياري للمشروع"
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Annotation Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">نوع التوسيم</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">اختر نوع التوسيم</label>
                  <Select value={projectForm.annotationType} onValueChange={v => setProjectForm(f => ({ ...f, annotationType: v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOTATION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {projectForm.annotationType !== "html_interface" && (
                  <div>
                    <label className="text-sm font-medium">التصنيفات (اسم,لون,اختصار)</label>
                    <textarea
                      value={projectForm.labelsRaw}
                      onChange={e => setProjectForm(f => ({ ...f, labelsRaw: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                      placeholder="إيجابي,#10B981,1&#10;سلبي,#EF4444,2&#10;محايد,#94A3B8,3"
                    />
                    <p className="text-xs text-slate-500 mt-1">كل سطر: الاسم,الكود اللوني,الاختصار</p>
                  </div>
                )}

                {projectForm.annotationType === "html_interface" && (
                  <div>
                    <label className="text-sm font-medium">كود HTML للواجهة</label>
                    <textarea
                      value={projectForm.instructions}
                      onChange={e => setProjectForm(f => ({ ...f, instructions: e.target.value }))}
                      rows={6}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                      placeholder="أدخل كود HTML للواجهة التفاعلية"
                    />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">الحد الأدنى للتوسيمات</label>
                  <Input
                    type="number"
                    value={projectForm.minAnnotations}
                    onChange={e => setProjectForm(f => ({ ...f, minAnnotations: Number(e.target.value) }))}
                    min={1}
                    className="mt-1"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={projectForm.aiPreAnnotation}
                      onChange={e => setProjectForm(f => ({ ...f, aiPreAnnotation: e.target.checked }))}
                      className="rounded"
                    />
                    تفعيل التوسيم المسبق بـ AI
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={projectForm.qaAiEnabled}
                      onChange={e => setProjectForm(f => ({ ...f, qaAiEnabled: e.target.checked }))}
                      className="rounded"
                    />
                    تفعيل مراجعة الجودة بـ AI
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={projectForm.spamDetection}
                      onChange={e => setProjectForm(f => ({ ...f, spamDetection: e.target.checked }))}
                      className="rounded"
                    />
                    تفعيل كشف البريد العشوائي
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">المهام</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 border-b">
                  <button
                    onClick={() => setUploadMode("text")}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      uploadMode === "text"
                        ? "border-primary text-primary"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    نص
                  </button>
                  <button
                    onClick={() => setUploadMode("file")}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      uploadMode === "file"
                        ? "border-primary text-primary"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    ملف
                  </button>
                </div>

                {uploadMode === "text" ? (
                  <textarea
                    value={projectForm.tasksText}
                    onChange={e => setProjectForm(f => ({ ...f, tasksText: e.target.value }))}
                    rows={8}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="أدخل كل مهمة في سطر منفصل..."
                  />
                ) : (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                    <Upload size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-600 mb-3">اسحب الملف هنا أو انقر للاختيار</p>
                    <p className="text-xs text-slate-500 mb-3">صيغ مدعومة: TXT, JSON, JSONL, CSV, TSV, XLSX</p>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept=".txt,.json,.jsonl,.csv,.tsv,.xlsx,.xls"
                      className="hidden"
                      id="file-upload"
                    />
                    <Button asChild variant="outline" size="sm">
                      <label htmlFor="file-upload" className="cursor-pointer">
                        اختر ملفاً
                      </label>
                    </Button>
                    {uploadFileName && (
                      <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-700">
                        ✅ {uploadFileName}
                      </div>
                    )}
                    {uploadError && (
                      <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        ❌ {uploadError}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ملخص</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500">اسم المشروع</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{projectForm.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">نوع التوسيم</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {ANNOTATION_TYPES.find(t => t.value === projectForm.annotationType)?.label}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">عدد المهام</p>
                  <p className="text-2xl font-bold text-primary">{taskCount}</p>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-xs text-slate-500 mb-2">التصنيفات</p>
                  <div className="flex flex-wrap gap-1">
                    {(projectForm.labelsRaw || "").split("\n").filter(s => s.trim()).map((line, i) => {
                      const parts = line.split(",");
                      const color = parts[1]?.trim() || "#888";
                      return (
                        <Badge key={i} style={{ backgroundColor: color }} className="text-white">
                          {parts[0]?.trim()}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardContent className="pt-6 space-y-2">
                <Button
                  onClick={handleCreateProject}
                  disabled={createProject.isPending || !projectForm.name.trim() || taskCount === 0}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  size="lg"
                >
                  {createProject.isPending ? "جاري الإنشاء..." : "إنشاء المشروع"}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <a href="/admin/projects">عودة للمشاريع</a>
                </Button>
              </CardContent>
            </Card>

            {/* Requirements */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">المتطلبات</h3>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li className={projectForm.name.trim() ? "text-emerald-700" : ""}>
                    {projectForm.name.trim() ? "✅" : "○"} اسم المشروع
                  </li>
                  <li className={taskCount > 0 ? "text-emerald-700" : ""}>
                    {taskCount > 0 ? "✅" : "○"} مهمة واحدة على الأقل
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
