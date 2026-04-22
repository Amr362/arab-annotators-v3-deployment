import React, { useState, useEffect, useCallback } from "react";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Eye, Save, X, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import AnnotationWidget from "@/components/annotation/AnnotationWidget";
import type { ProjectLabelConfig, AnnotationResult, AnnotationType, LabelOption } from "@/components/annotation/types";

const DEFAULT_LABEL_CONFIG: ProjectLabelConfig = {
  type: "classification",
  labels: [
    { value: "إيجابي", color: "#10B981", shortcut: "1" },
    { value: "سلبي",   color: "#EF4444", shortcut: "2" },
    { value: "محايد",  color: "#94A3B8", shortcut: "3" },
  ],
  instructions: "اقرأ النص بعناية ثم اختر التصنيف المناسب...",
  minAnnotations: 1,
  aiPreAnnotation: false,
};

const ANNOTATION_TYPES: { value: AnnotationType; label: string }[] = [
  { value: "classification", label: "تصنيف نصي (اختيار واحد)" },
  { value: "multi_classification", label: "تصنيف نصي (اختيارات متعددة)" },
  { value: "ner", label: "تحديد الكيانات المسماة (NER)" },
  { value: "pairwise", label: "مقارنة نصين" },
  { value: "relations", label: "علاقات بين الكيانات" },
];

export default function ProjectInterfaceBuilder() {
  const params = useParams();
  const projectId = params.projectId ? parseInt(params.projectId as string) : null;

  const { data: projectData, isLoading: isLoadingProject } = trpc.projects.getById.useQuery(
    { id: projectId! },
    { enabled: projectId !== null }
  );

  useEffect(() => {
    if (projectData) {
      setConfig({
        type: projectData.annotationType as AnnotationType,
        labels: (projectData.labelsConfig as ProjectLabelConfig)?.labels || [],
        instructions: projectData.instructions || "",
        minAnnotations: projectData.minAnnotations || 1,
        aiPreAnnotation: projectData.aiPreAnnotation || false,
      });
    }
  }, [projectData]);
  const [config, setConfig] = useState<ProjectLabelConfig>(DEFAULT_LABEL_CONFIG);
  const [previewText, setPreviewText] = useState("هذا مثال لنص سيتم توسيمه. يرجى اختيار التصنيف المناسب له.");
  const [previewResult, setPreviewResult] = useState<AnnotationResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleConfigChange = useCallback((field: keyof ProjectLabelConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleLabelChange = useCallback((index: number, field: keyof LabelOption, value: string) => {
    setConfig(prev => {
      const newLabels = [...prev.labels!];
      newLabels[index] = { ...newLabels[index], [field]: value };
      return { ...prev, labels: newLabels };
    });
  }, []);

  const addLabel = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      labels: [...prev.labels!, { value: "تسمية جديدة", color: "#CCCCCC", shortcut: "" }],
    }));
  }, []);

  const removeLabel = useCallback((index: number) => {
    setConfig(prev => ({
      ...prev,
      labels: prev.labels!.filter((_, i) => i !== index),
    }));
  }, []);

  const updateConfigMutation = trpc.projects.updateLabelingConfig.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الواجهة بنجاح!");
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const saveConfig = useCallback(async () => {
    if (!projectId) {
      toast.error("لا يمكن حفظ الإعدادات بدون معرف المشروع.");
      return;
    }
    await updateConfigMutation.mutateAsync({
      projectId,
      annotationType: config.type,
      labelsConfig: { labels: config.labels }, // Ensure labelsConfig is an object with a labels array
      instructions: config.instructions,
      minAnnotations: config.minAnnotations,
      aiPreAnnotation: config.aiPreAnnotation,
    });

  }, [config]);

  return (
    <ArabAnnotatorsDashboardLayout title="بناء واجهة التوسيم">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 mb-6">إعدادات الواجهة</h2>

            <div className="space-y-5">
              {/* Annotation Type */}
              <div>
                <Label htmlFor="annotationType" className="mb-2 block">نوع التوسيم</Label>
                <Select
                  value={config.type}
                  onValueChange={(value: AnnotationType) => handleConfigChange("type", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر نوع التوسيم" />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOTATION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Labels Configuration (for classification, multi_classification, ner, relations) */}
              {(config.type === "classification" || config.type === "multi_classification" || config.type === "ner" || config.type === "relations") && (
                <div>
                  <Label className="mb-2 block">التسميات / الكيانات</Label>
                  <p className="text-sm text-slate-500 mb-3">لكل سطر: قيمة التسمية، اللون الهيكس، الاختصار (اختياري)</p>
                  <div className="space-y-3">
                    {config.labels?.map((label, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          placeholder="قيمة التسمية (مثال: إيجابي)"
                          value={label.value}
                          onChange={(e) => handleLabelChange(index, "value", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={label.color}
                          onChange={(e) => handleLabelChange(index, "color", e.target.value)}
                          className="w-12 h-10 p-1"
                          title="اختر لون التسمية"
                        />
                        <Input
                          placeholder="اختصار (مثال: 1)"
                          value={label.shortcut || ""}
                          onChange={(e) => handleLabelChange(index, "shortcut", e.target.value)}
                          className="w-24"
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeLabel(index)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" onClick={addLabel} className="w-full">
                      <Plus className="h-4 w-4 mr-2" /> إضافة تسمية / كيان
                    </Button>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div>
                <Label htmlFor="instructions" className="mb-2 block">تعليمات التوسيم (تظهر للموسِّم)</Label>
                <Textarea
                  id="instructions"
                  placeholder="اكتب هنا التعليمات التي ستظهر للموسِّم..."
                  value={config.instructions || ""}
                  onChange={(e) => handleConfigChange("instructions", e.target.value)}
                  rows={5}
                />
              </div>

              {/* Min Annotations */}
              <div>
                <Label htmlFor="minAnnotations" className="mb-2 block">الحد الأدنى للتوسيمات المطلوبة لكل مهمة</Label>
                <Input
                  id="minAnnotations"
                  type="number"
                  value={config.minAnnotations}
                  onChange={(e) => handleConfigChange("minAnnotations", parseInt(e.target.value) || 1)}
                  min={1}
                  className="w-24"
                />
              </div>

              {/* AI Pre-annotation */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="aiPreAnnotation"
                  checked={config.aiPreAnnotation}
                  onCheckedChange={(checked) => handleConfigChange("aiPreAnnotation", checked)}
                />
                <Label htmlFor="aiPreAnnotation">تفعيل اقتراحات AI التلقائية</Label>
              </div>

              <Button onClick={saveConfig} className="w-full mt-6">
                {updateConfigMutation.isPending ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 ml-2" />
                )} حفظ إعدادات الواجهة
              </Button>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800">معاينة الواجهة</h2>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(s => !s)}>
                {showPreview ? <X className="h-4 w-4 ml-2" /> : <Eye className="h-4 w-4 ml-2" />} {showPreview ? "إخفاء المعاينة" : "إظهار المعاينة"}
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="previewText" className="mb-2 block">نص المعاينة</Label>
                <Textarea
                  id="previewText"
                  placeholder="اكتب نصاً لمعاينة واجهة التوسيم..."
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  rows={3}
                />
              </div>

              {showPreview && (
                <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50">
                  <h3 className="text-lg font-semibold text-slate-700 mb-3">معاينة حية</h3>
                  <AnnotationWidget
                    text={previewText}
                    config={config}
                    value={previewResult}
                    onChange={setPreviewResult}
                    readOnly={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
