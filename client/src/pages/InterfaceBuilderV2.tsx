import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Eye,
  Send,
  Trash2,
  Code2,
  FolderOpen,
  ChevronRight,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Pencil,
  Copy,
  Download,
  Upload,
  Settings,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  Palette,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface InterfaceProject {
  id: string;
  name: string;
  description: string;
  html: string;
  createdAt: string;
  publishedProjectId?: number;
  tags?: string[];
  category?: string;
  lastModified?: string;
}

interface EditorState {
  activeId: string | null;
  html: string;
  showPreview: boolean;
  splitView: boolean;
  autoRefresh: boolean;
  fontSize: number;
}

const STORAGE_KEY = "interface-builder-projects-v2";
const INITIALIZED_KEY = "interface-builder-initialized-v2";

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadProjects(): InterfaceProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const projects = raw ? JSON.parse(raw) : [];

    const isInitialized = localStorage.getItem(INITIALIZED_KEY);
    if (!isInitialized && projects.length === 0) {
      localStorage.setItem(INITIALIZED_KEY, "true");
      saveProjects([SAMPLE]);
      return [SAMPLE];
    }

    return projects;
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
  category: "تصنيف",
  tags: ["أمثال", "تصنيف", "عربي"],
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
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'annotation_result', result: { label: selected } }, '*');
    }
  }
  window.addEventListener('message', function(ev) {
    if (ev.data?.type === 'task_content' && ev.data.content) {
      document.getElementById('proverb-text').textContent = ev.data.content;
    }
  });
</script>
</body>
</html>`,
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
};

// ── Enhanced Interface Builder Component ──────────────────────────────────────

export default function InterfaceBuilderV2() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<InterfaceProject[]>([]);
  const [editorState, setEditorState] = useState<EditorState>({
    activeId: null,
    html: "",
    showPreview: false,
    splitView: false,
    autoRefresh: true,
    fontSize: 14,
  });
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [publishForm, setPublishForm] = useState({ name: "", description: "", tasks: "" });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => toast.success("تم حذف المشروع من السيرفر"),
    onError: (e) => toast.error("فشل حذف المشروع: " + e.message),
  });

  const createProject = trpc.taskManagement.createProjectWithTasks.useMutation({
    onSuccess: (r) => {
      toast.success(`✅ تم نشر الواجهة — ${r?.taskCount ?? 0} مهمة`);
      const updated = projects.filter((p) => p.id !== editorState.activeId);
      setProjects(updated);
      saveProjects(updated);
      setEditorState((prev) => ({
        ...prev,
        activeId: updated[0]?.id ?? null,
        html: updated[0]?.html ?? "",
      }));
      setShowPublishModal(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadProjects();
    setProjects(stored);
    if (stored.length > 0) {
      setEditorState((prev) => ({
        ...prev,
        activeId: stored[0].id,
        html: stored[0].html,
      }));
    }
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === editorState.activeId) ?? null,
    [projects, editorState.activeId]
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [projects, searchQuery]
  );

  const selectProject = useCallback((p: InterfaceProject) => {
    setEditorState((prev) => ({
      ...prev,
      activeId: p.id,
      html: p.html,
      showPreview: false,
    }));
  }, []);

  const handleHtmlChange = useCallback((val: string) => {
    setEditorState((prev) => ({ ...prev, html: val }));
    const updated = projects.map((p) =>
      p.id === editorState.activeId
        ? {
            ...p,
            html: val,
            lastModified: new Date().toISOString(),
          }
        : p
    );
    setProjects(updated);
    saveProjects(updated);
  }, [projects, editorState.activeId]);

  const createNew = useCallback(() => {
    if (!newName.trim()) {
      toast.error("أدخل اسم الواجهة");
      return;
    }
    const proj: InterfaceProject = {
      id: "p" + Date.now(),
      name: newName.trim(),
      description: newDesc.trim(),
      category: newCategory.trim(),
      tags: [],
      html: `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<style>\n  body { font-family: system-ui, sans-serif; padding: 24px; direction: rtl; }\n</style>\n</head>\n<body>\n  <h2>واجهتي الجديدة</h2>\n</body>\n</html>`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    const updated = [proj, ...projects];
    setProjects(updated);
    saveProjects(updated);
    setEditorState((prev) => ({
      ...prev,
      activeId: proj.id,
      html: proj.html,
    }));
    setNewName("");
    setNewDesc("");
    setNewCategory("");
    setShowNewModal(false);
    toast.success("تم إنشاء الواجهة");
  }, [projects, newName, newDesc, newCategory]);

  const deleteProject = useCallback(
    (id: string) => {
      const proj = projects.find((p) => p.id === id);
      if (
        !confirm(
          proj?.publishedProjectId
            ? "حذف هذه الواجهة والمشروع المنشور على السيرفر؟"
            : "حذف هذه الواجهة؟"
        )
      )
        return;

      if (proj?.publishedProjectId) {
        deleteProjectMutation.mutate({ id: proj.publishedProjectId });
      }

      const updated = projects.filter((p) => p.id !== id);
      setProjects(updated);
      saveProjects(updated);
      if (editorState.activeId === id) {
        setEditorState((prev) => ({
          ...prev,
          activeId: updated[0]?.id ?? null,
          html: updated[0]?.html ?? "",
        }));
      }
      toast.success("تم الحذف");
    },
    [projects, editorState.activeId, deleteProjectMutation]
  );

  const openPublishModal = useCallback(() => {
    if (!activeProject) return;
    setPublishForm({
      name: activeProject.name,
      description: activeProject.description || "",
      tasks: "مهمة 1\nمهمة 2\nمهمة 3",
    });
    setShowPublishModal(true);
  }, [activeProject]);

  const handlePublish = useCallback(() => {
    if (!activeProject) return;
    if (!publishForm.name.trim()) {
      toast.error("أدخل اسم المشروع");
      return;
    }
    if (!publishForm.tasks.trim()) {
      toast.error("أدخل مهام للتاسكرز");
      return;
    }
    createProject.mutate({
      name: publishForm.name.trim(),
      description: publishForm.description.trim(),
      tasksText: publishForm.tasks,
      annotationType: "html_interface",
      instructions: editorState.html,
    });
  }, [activeProject, publishForm, editorState.html, createProject]);

  const handleExport = useCallback(() => {
    if (!activeProject) return;
    const data = JSON.stringify(activeProject, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interface-${activeProject.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeProject]);

  const handleDuplicate = useCallback(() => {
    if (!activeProject) return;
    const newProj: InterfaceProject = {
      ...activeProject,
      id: "p" + Date.now(),
      name: `${activeProject.name} (نسخة)`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      publishedProjectId: undefined,
    };
    const updated = [newProj, ...projects];
    setProjects(updated);
    saveProjects(updated);
    setEditorState((prev) => ({
      ...prev,
      activeId: newProj.id,
      html: newProj.html,
    }));
    toast.success("تم نسخ الواجهة");
  }, [activeProject, projects]);

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
    <ArabAnnotatorsDashboardLayout title="منشئ الواجهات v2">
      <div className="flex h-full overflow-hidden gap-4 p-4" dir="rtl">
        {/* ─── Enhanced Sidebar ─── */}
        <aside className="w-72 bg-white rounded-lg border border-slate-200 flex flex-col flex-shrink-0 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">الواجهات ({projects.length})</span>
              <button
                onClick={() => setShowNewModal(true)}
                className="w-8 h-8 rounded-lg bg-[#00D4A8]/10 text-[#00D4A8] flex items-center justify-center hover:bg-[#00D4A8]/20 transition-colors"
                title="واجهة جديدة"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00D4A8]"
            />
          </div>

          {/* Projects List */}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredProjects.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-8">
                {searchQuery ? "لا توجد نتائج" : "لا توجد واجهات"}
              </p>
            ) : (
              filteredProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectProject(p)}
                  className={`group relative rounded-lg p-3 mb-2 cursor-pointer transition-all border ${
                    editorState.activeId === p.id
                      ? "bg-[#00D4A8]/8 border-[#00D4A8]/20 shadow-sm"
                      : "hover:bg-slate-50 border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[13px] font-medium truncate ${
                          editorState.activeId === p.id
                            ? "text-[#00D4A8]"
                            : "text-slate-700"
                        }`}
                      >
                        {p.name}
                      </p>
                      {p.description && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {p.description}
                        </p>
                      )}
                      {p.category && (
                        <span className="inline-block text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1">
                          {p.category}
                        </span>
                      )}
                      {p.publishedProjectId && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-1 ml-1">
                          <CheckCircle2 size={9} /> منشورة
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                      }}
                      className="text-slate-300 hover:text-red-400 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100"
                      title="حذف"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ─── Main Editor Area ─── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm">
          {/* Topbar */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <Palette size={18} className="text-[#00D4A8]" />
              <span className="font-semibold text-slate-800 text-sm">
                {activeProject?.name ?? "اختر واجهة"}
              </span>
              {activeProject && (
                <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  HTML · CSS · JS
                </span>
              )}
            </div>

            {activeProject && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setEditorState((prev) => ({
                      ...prev,
                      splitView: !prev.splitView,
                    }))
                  }
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border ${
                    editorState.splitView
                      ? "bg-[#00D4A8]/10 text-[#00D4A8] border-[#00D4A8]/20"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                  title="عرض مقسم"
                >
                  {editorState.splitView ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>

                <button
                  onClick={() =>
                    setEditorState((prev) => ({
                      ...prev,
                      showPreview: !prev.showPreview,
                    }))
                  }
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border ${
                    editorState.showPreview
                      ? "bg-[#00D4A8]/10 text-[#00D4A8] border-[#00D4A8]/20"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                  title="معاينة"
                >
                  {editorState.showPreview ? <Code2 size={14} /> : <Eye size={14} />}
                  {editorState.showPreview ? "المحرر" : "معاينة"}
                </button>

                <button
                  onClick={handleDuplicate}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white text-slate-600 border border-slate-200 hover:border-slate-300 transition-colors"
                  title="نسخ"
                >
                  <Copy size={14} />
                </button>

                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white text-slate-600 border border-slate-200 hover:border-slate-300 transition-colors"
                  title="تصدير"
                >
                  <Download size={14} />
                </button>

                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white text-slate-600 border border-slate-200 hover:border-slate-300 transition-colors"
                  title="الإعدادات"
                >
                  <Settings size={14} />
                </button>

                <button
                  onClick={openPublishModal}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#00D4A8] text-white hover:bg-[#00b894] transition-colors"
                >
                  <Send size={14} />
                  نشر
                </button>
              </div>
            )}
          </div>

          {/* Settings Panel */}
          {showSettings && activeProject && (
            <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <label className="text-blue-700 font-medium">حجم الخط:</label>
                <input
                  type="range"
                  min="12"
                  max="18"
                  value={editorState.fontSize}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      fontSize: parseInt(e.target.value),
                    }))
                  }
                  className="w-24"
                />
                <span className="text-blue-600">{editorState.fontSize}px</span>
              </div>

              <label className="flex items-center gap-2 text-blue-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editorState.autoRefresh}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      autoRefresh: e.target.checked,
                    }))
                  }
                  className="w-4 h-4"
                />
                تحديث فوري
              </label>
            </div>
          )}

          {/* Editor / Preview */}
          {!activeProject ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-3">
              <FolderOpen size={40} className="text-slate-300" />
              <p className="text-sm font-medium">اختر واجهة أو أنشئ واجهة جديدة</p>
            </div>
          ) : editorState.splitView ? (
            <div className="flex-1 flex overflow-hidden gap-4 p-4">
              {/* Editor */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 rounded-lg">
                <textarea
                  ref={editorRef}
                  value={editorState.html}
                  onChange={(e) => handleHtmlChange(e.target.value)}
                  className="flex-1 p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none focus:outline-none"
                  style={{ fontSize: `${editorState.fontSize}px` }}
                  spellCheck="false"
                />
              </div>

              {/* Preview */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 rounded-lg border border-slate-200">
                <iframe
                  ref={iframeRef}
                  srcDoc={editorState.html}
                  className="flex-1 border-none"
                  sandbox={{
                    allow: "scripts",
                  } as any}
                />
              </div>
            </div>
          ) : editorState.showPreview ? (
            <div className="flex-1 overflow-hidden p-4">
              <div className="h-full bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                <iframe
                  ref={iframeRef}
                  srcDoc={editorState.html}
                  className="w-full h-full border-none"
                  sandbox={{
                    allow: "scripts",
                  } as any}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden p-4">
              <textarea
                ref={editorRef}
                value={editorState.html}
                onChange={(e) => handleHtmlChange(e.target.value)}
                className="w-full h-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none focus:outline-none rounded-lg border border-slate-700"
                style={{ fontSize: `${editorState.fontSize}px` }}
                spellCheck="false"
              />
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">واجهة جديدة</h3>
            <input
              type="text"
              placeholder="اسم الواجهة"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D4A8]"
            />
            <input
              type="text"
              placeholder="الوصف"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D4A8]"
            />
            <input
              type="text"
              placeholder="الفئة"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D4A8]"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={createNew}
                className="px-4 py-2 rounded-lg bg-[#00D4A8] text-white hover:bg-[#00b894]"
              >
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {showPublishModal && activeProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">نشر الواجهة</h3>
            <input
              type="text"
              placeholder="اسم المشروع"
              value={publishForm.name}
              onChange={(e) => setPublishForm({ ...publishForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D4A8]"
            />
            <input
              type="text"
              placeholder="الوصف"
              value={publishForm.description}
              onChange={(e) =>
                setPublishForm({ ...publishForm, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D4A8]"
            />
            <textarea
              placeholder="المهام (سطر واحد لكل مهمة)"
              value={publishForm.tasks}
              onChange={(e) => setPublishForm({ ...publishForm, tasks: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D4A8] h-24 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={handlePublish}
                disabled={createProject.isPending}
                className="px-4 py-2 rounded-lg bg-[#00D4A8] text-white hover:bg-[#00b894] disabled:opacity-50"
              >
                {createProject.isPending ? "جاري..." : "نشر"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ArabAnnotatorsDashboardLayout>
  );
}
