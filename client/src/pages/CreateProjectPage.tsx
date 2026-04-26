import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Settings, List, CheckCircle2, Info, X } from "lucide-react";

const ANNOTATION_TYPES = [
  { value: "classification", label: "تصنيف نصي (اختيار واحد)" },
  { value: "multi_classification", label: "تصنيف متعدد" },
  { value: "ner", label: "تحديد كيانات (NER)" },
  { value: "pairwise", label: "مقارنة نصين" },
  { value: "relations", label: "علاقات بين كيانات" },
  { value: "html_interface", label: "🖥️ واجهة HTML مخصصة" },
];

export default function CreateProjectPage() {
  const { user } = useAuth();
  const [uploadMode, setUploadMode] = useState<"text" | "file">("text");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    labelsRaw: "إيجابي,#10B981,1\nسلبي,#EF4444,2\nمحايد,#94A3B8,3",
    tasksText: "",
    taskContents: [] as string[],
    annotationType: "classification",
    instructions: "",
    minAnnotations: 1,
    aiPreAnnotation: false,
    qaAiEnabled: false,
    spamDetection: false,
  });

  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success("✅ تم إنشاء المشروع بنجاح");
      // Redirect to the projects management page
      setTimeout(() => {
        window.location.href = "/admin/projects";
      }, 1000);
    },
    onError: (e) => toast.error(e.message),
  });

  async function parseUploadedFile(file: File): Promise<string[]> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const text = await file.text();
    
    if (ext === "txt") {
      return text.split("\n").map(s => s.trim()).filter(Boolean);
    }
    
    if (ext === "jsonl") {
      return text.split("\n").map(s => s.trim()).filter(Boolean).map(line => {
        try {
          const o = JSON.parse(line);
          return typeof o === "string" ? o : (o.text ?? o.content ?? o.sentence ?? JSON.stringify(o));
        } catch { return line; }
      });
    }
    
    if (ext === "json") {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.tasks ?? parsed.items ?? [];
        return arr.map((o: any) => typeof o === "string" ? o : (o.text ?? o.content ?? o.sentence ?? o.data ?? JSON.stringify(o)));
      } catch { throw new Error("ملف JSON غير صالح"); }
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
      return lines.slice(1).map(line => line.split(sep)[0].replace(/^"|"$/g, "").trim()).filter(Boolean);
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
    if (!projectForm.name.trim()) return toast.error("أدخل اسم المشروع");
    
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
    return <div className="p-8 text-center text-red-500">ليس لديك صلاحية الوصول</div>;
  }

  const taskCount = projectForm.taskContents?.length || projectForm.tasksText.split("\n").filter(s => s.trim()).length || 0;

  return (
    <ArabAnnotatorsDashboardLayout title="إنشاء مشروع جديد">
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🚀 إنشاء مشروع جديد</h1>
            <p className="text-slate-500 mt-1">قم بإعداد المشروع ورفع البيانات للبدء في التوسيم</p>
          </div>
          <Button variant="outline" onClick={() => window.location.href = "/admin/projects"}>إلغاء</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Project Info */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-lg flex items-center gap-2"><Info size={18} className="text-primary" /> معلومات المشروع</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">اسم المشروع *</label>
                  <Input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: تصنيف المشاعر في التغريدات" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">وصف المشروع</label>
                  <Textarea value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} placeholder="اشرح هدف المشروع للموسِّمين..." className="mt-1 h-20" />
                </div>
              </CardContent>
            </Card>

            {/* 2. Dataset Upload */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><FileText size={18} className="text-primary" /> رفع الداتا سيت (المهام)</CardTitle>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setUploadMode("text")} className={`px-3 py-1 text-xs rounded-md transition-all ${uploadMode === "text" ? "bg-white shadow text-primary font-bold" : "text-slate-500"}`}>✏️ يدوي</button>
                  <button onClick={() => setUploadMode("file")} className={`px-3 py-1 text-xs rounded-md transition-all ${uploadMode === "file" ? "bg-white shadow text-primary font-bold" : "text-slate-500"}`}>📤 رفع ملف</button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {uploadMode === "text" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">أدخل البيانات يدوياً (سطر لكل مهمة)</label>
                    <Textarea 
                      value={projectForm.tasksText} 
                      onChange={e => setProjectForm(f => ({ ...f, tasksText: e.target.value, taskContents: [] }))} 
                      placeholder="الجملة الأولى...\nالجملة الثانية..." 
                      className="h-40 font-mono text-sm"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${uploadFileName ? "border-emerald-400 bg-emerald-50/30" : "border-slate-200 hover:border-primary hover:bg-slate-50"}`}>
                      <input type="file" id="file-upload" className="hidden" accept=".txt,.json,.jsonl,.csv,.tsv,.xlsx,.xls" onChange={handleFileUpload} />
                      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                        <Upload size={40} className={`mb-3 ${uploadFileName ? "text-emerald-500" : "text-slate-400"}`} />
                        <p className="text-sm font-semibold text-slate-700">{uploadFileName || "اسحب الملف هنا أو انقر للاختيار"}</p>
                        <p className="text-xs text-slate-500 mt-1">يدعم: TXT, JSON, CSV, XLSX</p>
                        <Button asChild variant="outline" size="sm" className="mt-4"><span>اختر ملفاً</span></Button>
                      </label>
                    </div>
                    {uploadError && <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex items-center gap-2"><span>⚠️</span> {uploadError}</div>}
                    <div className="grid grid-cols-2 gap-2">
                      {["TXT: سطر لكل مهمة", "CSV: عمود 'text'", "JSON: مصفوفة نصوص", "XLSX: ورقة 1 عمود 'text'"].map(t => (
                        <div key={t} className="text-[10px] bg-slate-50 text-slate-500 p-2 rounded border border-slate-100">💡 {t}</div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Configuration */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-lg flex items-center gap-2"><Settings size={18} className="text-primary" /> إعدادات التوسيم</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">نوع التوسيم</label>
                    <select className="w-full mt-1 border border-slate-200 rounded-md p-2 text-sm" value={projectForm.annotationType} onChange={e => setProjectForm(f => ({ ...f, annotationType: e.target.value }))}>
                      {ANNOTATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">عدد التوسيمات لكل مهمة</label>
                    <Input type="number" min={1} value={projectForm.minAnnotations} onChange={e => setProjectForm(f => ({ ...f, minAnnotations: Number(e.target.value) }))} className="mt-1" />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">التصنيفات (الاسم,اللون,الاختصار)</label>
                  <Textarea value={projectForm.labelsRaw} onChange={e => setProjectForm(f => ({ ...f, labelsRaw: e.target.value }))} className="mt-1 h-24 font-mono text-sm" />
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  {[
                    { id: "aiPreAnnotation", label: "🤖 AI Pre-label" },
                    { id: "qaAiEnabled", label: "🔍 QA AI Review" },
                    { id: "spamDetection", label: "🛡️ Spam Detection" }
                  ].map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={(projectForm as any)[opt.id]} onChange={e => setProjectForm(f => ({ ...f, [opt.id]: e.target.checked }))} className="rounded text-primary focus:ring-primary" />
                      <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Summary */}
          <div className="space-y-6">
            <Card className="border-primary/20 shadow-md bg-primary/5 sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 size={18} className="text-primary" /> ملخص المشروع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">إجمالي المهام</p>
                  <p className="text-3xl font-bold text-primary">{taskCount.toLocaleString("ar-EG")}</p>
                </div>
                <div className="space-y-1 pt-2 border-t border-primary/10">
                  <p className="text-xs text-slate-500">التصنيفات المحددة</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {projectForm.labelsRaw.split("\n").filter(s => s.trim()).map((l, i) => (
                      <Badge key={i} style={{ backgroundColor: l.split(",")[1] || "#888" }} className="text-white text-[10px]">{l.split(",")[0]}</Badge>
                    ))}
                  </div>
                </div>
                <div className="pt-4">
                  <Button onClick={handleCreateProject} disabled={createProject.isPending || !projectForm.name || taskCount === 0} className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg py-6 text-lg font-bold">
                    {createProject.isPending ? "جاري الإنشاء..." : "🚀 إنشاء المشروع الآن"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
