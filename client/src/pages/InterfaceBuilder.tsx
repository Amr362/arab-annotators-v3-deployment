import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Plus, Eye, Send, Trash2, Code2, FolderOpen,
  ChevronRight, X, Loader2, CheckCircle2, AlertCircle,
  Monitor, Pencil,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface InterfaceProject {
  id: string;
  name: string;
  description: string;
  html: string;
  createdAt: string;
  publishedProjectId?: number;
}

const STORAGE_KEY = "interface-builder-projects-v1";

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadProjects(): InterfaceProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjects(projects: InterfaceProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

const SAMPLE: InterfaceProject = {
  id: "sample-1",
  name: "واجهة تصنيف الأمثال",
  description: "واجهة تفاعلية لتصنيف الأمثال العربية",
  html: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', system-ui, sans-serif; background: #f8f9fa; padding: 24px; direction: rtl; }
  .card { background: white; border-radius: 12px; padding: 24px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  h2 { font-size: 18px; color: #1a1a2e; margin-bottom: 8px; }
  .proverb { font-size: 20px; color: #333; background: #f0faf6; padding: 16px; border-radius: 8px; margin: 16px 0; border-right: 4px solid #00D4A8; line-height: 1.8; }
  .labels { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .label-btn { padding: 10px 20px; border-radius: 8px; border: 2px solid #e2e8f0; background: white; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500; transition: all .2s; color: #374151; }
  .label-btn:hover { border-color: #00D4A8; color: #00D4A8; background: #f0faf6; }
  .label-btn.selected { background: #00D4A8; color: white; border-color: #00D4A8; }
  .submit-btn { margin-top: 20px; width: 100%; padding: 12px; background: #00D4A8; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .2s; }
  .submit-btn:hover { background: #00b894; }
  .submit-btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
</head>
<body>
<div class="card">
  <h2>صنّف المثل التالي</h2>
  <p style="font-size:13px;color:#64748b;margin-top:4px">اختر الفئة المناسبة للمثل من القائمة أدناه</p>
  <div class="proverb" id="proverb-text">اللي ما يعرفك ما يثمنك</div>
  <div class="labels">
    <button class="label-btn" onclick="select(this,'حكمة')">حكمة</button>
    <button class="label-btn" onclick="select(this,'علاقات اجتماعية')">علاقات اجتماعية</button>
    <button class="label-btn" onclick="select(this,'تحفيز')">تحفيز</button>
    <button class="label-btn" onclick="select(this,'تحذير')">تحذير</button>
  </div>
  <button class="submit-btn" id="submit-btn" onclick="submitResult()" disabled>تسليم التصنيف</button>
</div>
<script>
  let selected = null;
  function select(btn, label) {
    document.querySelectorAll('.label-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selected = label;
    document.getElementById('submit-btn').disabled = false;
  }
  function submitResult() {
    if (!selected) return;
    // Send result to parent platform
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'annotation_result', result: { label: selected } }, '*');
    }
    alert('تم تسليم التصنيف: ' + selected);
  }
</script>
</body>
</html>`,
  createdAt: new Date().toISOString(),
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function InterfaceBuilder() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<InterfaceProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [publishForm, setPublishForm] = useState({ name: "", description: "", tasks: "" });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const createProject = trpc.taskManagement.createProjectWithTasks.useMutation({
    onSuccess: (r) => {
      toast.success(`✅ تم نشر الواجهة — ${r?.taskCount ?? 0} مهمة`);
      if (activeId && r?.projectId) {
        const updated = projects.map(p =>
          p.id === activeId ? { ...p, publishedProjectId: r.projectId } : p
        );
        setProjects(updated);
        saveProjects(updated);
      }
      setShowPublishModal(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Load from localStorage on mount
  useEffect(() => {
    let stored = loadProjects();
    if (!stored.length) {
      stored = [SAMPLE];
      saveProjects(stored);
    }
    setProjects(stored);
    setActiveId(stored[0].id);
    setHtml(stored[0].html);
  }, []);

  const activeProject = projects.find(p => p.id === activeId) ?? null;

  function selectProject(p: InterfaceProject) {
    setActiveId(p.id);
    setHtml(p.html);
    setShowPreview(false);
  }

  function handleHtmlChange(val: string) {
    setHtml(val);
    const updated = projects.map(p => p.id === activeId ? { ...p, html: val } : p);
    setProjects(updated);
    saveProjects(updated);
  }

  function createNew() {
    if (!newName.trim()) { toast.error("أدخل اسم الواجهة"); return; }
    const proj: InterfaceProject = {
      id: "p" + Date.now(),
      name: newName.trim(),
      description: newDesc.trim(),
      html: `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<style>\n  body { font-family: system-ui, sans-serif; padding: 24px; direction: rtl; }\n</style>\n</head>\n<body>\n  <h2>واجهتي الجديدة</h2>\n</body>\n</html>`,
      createdAt: new Date().toISOString(),
    };
    const updated = [proj, ...projects];
    setProjects(updated);
    saveProjects(updated);
    setActiveId(proj.id);
    setHtml(proj.html);
    setNewName("");
    setNewDesc("");
    setShowNewModal(false);
    toast.success("تم إنشاء الواجهة");
  }

  function deleteProject(id: string) {
    if (!confirm("حذف هذه الواجهة؟")) return;
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    saveProjects(updated);
    if (activeId === id) {
      setActiveId(updated[0]?.id ?? null);
      setHtml(updated[0]?.html ?? "");
    }
    toast.success("تم الحذف");
  }

  function openPublishModal() {
    if (!activeProject) return;
    setPublishForm({
      name: activeProject.name,
      description: activeProject.description || "",
      tasks: "مهمة 1\nمهمة 2\nمهمة 3",
    });
    setShowPublishModal(true);
  }

  function handlePublish() {
    if (!activeProject) return;
    if (!publishForm.name.trim()) { toast.error("أدخل اسم المشروع"); return; }
    if (!publishForm.tasks.trim()) { toast.error("أدخل مهام للتاسكرز"); return; }
    createProject.mutate({
      name: publishForm.name.trim(),
      description: publishForm.description.trim(),
      labelStudioProjectId: 0,
      tasksText: publishForm.tasks,
      annotationType: "html_interface",
      instructions: activeProject.html,
    });
  }

  if (user?.role !== "admin") {
    return (
      <ArabAnnotatorsDashboardLayout>
        <div className="flex items-center justify-center h-64 text-red-500 font-semibold">
          ليس لديك صلاحية الوصول
        </div>
      </ArabAnnotatorsDashboardLayout>
    );
  }

  return (
    <ArabAnnotatorsDashboardLayout title="منشئ الواجهات">
      <div className="flex h-full overflow-hidden" dir="rtl">

        {/* ─── Sidebar ─── */}
        <aside className="w-64 bg-white border-l border-slate-100 flex flex-col flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-sm">الواجهات</span>
            <button
              onClick={() => setShowNewModal(true)}
              className="w-7 h-7 rounded-lg bg-[#00D4A8]/10 text-[#00D4A8] flex items-center justify-center hover:bg-[#00D4A8]/20 transition-colors"
              title="واجهة جديدة"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => selectProject(p)}
                className={`group relative rounded-lg p-3 mb-1 cursor-pointer transition-all ${
                  activeId === p.id
                    ? "bg-[#00D4A8]/8 border border-[#00D4A8]/20"
                    : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-medium truncate ${activeId === p.id ? "text-[#00D4A8]" : "text-slate-700"}`}>
                      {p.name}
                    </p>
                    {p.description && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{p.description}</p>
                    )}
                    {p.publishedProjectId && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-1">
                        <CheckCircle2 size={9} /> منشورة
                      </span>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {!projects.length && (
              <p className="text-center text-slate-400 text-xs py-8">
                لا توجد واجهات — أنشئ واجهة جديدة
              </p>
            )}
          </div>
        </aside>

        {/* ─── Main editor / preview ─── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F4F6FA]">

          {/* Topbar */}
          <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <Code2 size={18} className="text-[#00D4A8]" />
              <span className="font-semibold text-slate-800 text-sm">
                {activeProject?.name ?? "اختر واجهة"}
              </span>
              {activeProject && (
                <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  HTML · CSS · JS
                </span>
              )}
            </div>

            {activeProject && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPreview(v => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border ${
                    showPreview
                      ? "bg-[#00D4A8]/10 text-[#00D4A8] border-[#00D4A8]/20"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {showPreview ? <Code2 size={14} /> : <Eye size={14} />}
                  {showPreview ? "المحرر" : "معاينة"}
                </button>
                <button
                  onClick={openPublishModal}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#00D4A8] text-white hover:bg-[#00b894] transition-colors"
                >
                  <Send size={14} />
                  نشر للتاسكرز
                </button>
              </div>
            )}
          </div>

          {/* Editor / Preview */}
          {!activeProject ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-3">
              <FolderOpen size={40} className="text-slate-300" />
              <p className="text-sm">اختر واجهة من القائمة أو أنشئ واحدة جديدة</p>
            </div>
          ) : showPreview ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-[#0D1117] px-5 py-2 flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                <Monitor size={13} />
                <span>معاينة مباشرة للواجهة</span>
                <span className="mr-auto text-slate-600">استخدم زر المحرر للرجوع وتعديل الكود</span>
              </div>
              <iframe
                ref={iframeRef}
                srcDoc={html}
                className="flex-1 w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="interface-preview"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
              <div className="flex-1 flex flex-col bg-[#0D1117] rounded-xl overflow-hidden border border-white/5">
                {/* Editor header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-[#161b22] flex-shrink-0">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-[11px] text-slate-500 mr-2 font-mono">{activeProject.name}.html</span>
                  <span className="mr-auto text-[11px] text-slate-600">
                    {html.split("\n").length} سطر
                  </span>
                </div>
                {/* Textarea code editor */}
                <textarea
                  value={html}
                  onChange={e => handleHtmlChange(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full bg-transparent text-slate-200 font-mono text-[12px] leading-6 p-4 resize-none outline-none border-0"
                  style={{ direction: "ltr", textAlign: "left", tabSize: 2 }}
                  placeholder="<!-- اكتب كود HTML/CSS/JS هنا -->"
                />
              </div>

              <div className="flex items-center gap-2 text-[12px] text-slate-500 px-1">
                <AlertCircle size={12} />
                <span>التغييرات تُحفظ تلقائياً في المتصفح. اضغط "معاينة" لرؤية النتيجة قبل النشر.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── New Interface Modal ─── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">واجهة جديدة</h3>
              <button onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4" dir="rtl">
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">اسم الواجهة *</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="مثلاً: واجهة تصنيف الأمثال"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#00D4A8] text-right"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">وصف (اختياري)</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="وصف مختصر..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#00D4A8] resize-none text-right"
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                إلغاء
              </button>
              <button onClick={createNew} className="px-4 py-2 text-sm bg-[#00D4A8] text-white rounded-lg hover:bg-[#00b894] transition-colors font-medium">
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Publish Modal ─── */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPublishModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-[#00D4A8]" />
                <h3 className="font-semibold text-slate-800">نشر الواجهة للتاسكرز</h3>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="p-5 flex flex-col gap-4" dir="rtl">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3">
                <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700">
                  سيتم إنشاء مشروع جديد في النظام وتوزيع المهام على التاسكرز. لا يمكن التراجع.
                </p>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">اسم المشروع *</label>
                <input
                  value={publishForm.name}
                  onChange={e => setPublishForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#00D4A8] text-right"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">وصف المشروع</label>
                <input
                  value={publishForm.description}
                  onChange={e => setPublishForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#00D4A8] text-right"
                  placeholder="وصف اختياري..."
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">
                  المهام — سطر لكل مهمة *
                </label>
                <textarea
                  value={publishForm.tasks}
                  onChange={e => setPublishForm(f => ({ ...f, tasks: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#00D4A8] resize-none font-mono"
                  style={{ direction: "rtl", textAlign: "right" }}
                  placeholder={"مهمة 1\nمهمة 2\nمهمة 3"}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {publishForm.tasks.split("\n").filter(l => l.trim()).length} مهمة
                </p>
              </div>

              {/* Interface preview thumbnail */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                  <Eye size={13} className="text-slate-400" />
                  <span className="text-[11px] text-slate-500">معاينة الواجهة</span>
                </div>
                <iframe
                  srcDoc={activeProject?.html ?? ""}
                  className="w-full h-48 border-0"
                  sandbox="allow-scripts"
                  title="preview-thumb"
                  style={{ transform: "scale(0.85)", transformOrigin: "top right", width: "117%", height: "56%" }}
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                إلغاء
              </button>
              <button
                onClick={handlePublish}
                disabled={createProject.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-[#00D4A8] text-white rounded-lg hover:bg-[#00b894] transition-colors font-medium disabled:opacity-60"
              >
                {createProject.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                نشر الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </ArabAnnotatorsDashboardLayout>
  );
}
