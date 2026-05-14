import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  TrendingUp,
  Users,
  CheckCircle2,
  BarChart3,
  LineChart as LineChartIcon,
  RefreshCw,
  Download,
  Filter,
  Info,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// ─── Enhanced Kappa Badge Component ────────────────────────────────────────

function KappaBadgeV2({ kappa, label }: { kappa: number; label: string }) {
  const pct = Math.round(kappa * 100);
  let color = "bg-red-100 text-red-700 border-red-200";
  let bgColor = "bg-red-50";
  let icon = "⚠️";

  if (kappa >= 0.8) {
    color = "bg-green-100 text-green-700 border-green-200";
    bgColor = "bg-green-50";
    icon = "✓";
  } else if (kappa >= 0.6) {
    color = "bg-blue-100 text-blue-700 border-blue-200";
    bgColor = "bg-blue-50";
    icon = "→";
  } else if (kappa >= 0.4) {
    color = "bg-yellow-100 text-yellow-700 border-yellow-200";
    bgColor = "bg-yellow-50";
    icon = "○";
  } else if (kappa >= 0.2) {
    color = "bg-orange-100 text-orange-700 border-orange-200";
    bgColor = "bg-orange-50";
    icon = "△";
  }

  return (
    <div className={`p-4 rounded-lg border ${color} ${bgColor} space-y-2`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-3xl font-bold">{kappa.toFixed(3)}</div>
      <div className="text-xs opacity-75">
        {icon} {pct}% من النطاق الكامل
      </div>
    </div>
  );
}

// ─── Enhanced Kappa Progress Bar Component ──────────────────────────────────

function KappaBarV2({ kappa, maxHeight = 300 }: { kappa: number; maxHeight?: number }) {
  const pct = Math.max(0, Math.min(100, ((kappa + 1) / 2) * 100));
  let barColor = "from-red-500 to-red-600";
  let textColor = "text-red-700";

  if (kappa >= 0.8) {
    barColor = "from-green-500 to-green-600";
    textColor = "text-green-700";
  } else if (kappa >= 0.6) {
    barColor = "from-blue-500 to-blue-600";
    textColor = "text-blue-700";
  } else if (kappa >= 0.4) {
    barColor = "from-yellow-500 to-yellow-600";
    textColor = "text-yellow-700";
  } else if (kappa >= 0.2) {
    barColor = "from-orange-500 to-orange-600";
    textColor = "text-orange-700";
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-lg overflow-hidden bg-gray-100 border border-gray-200" style={{ height: `${maxHeight}px` }}>
        {/* Zero line at 50% */}
        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gray-400 z-10" />

        {/* Negative side (left) */}
        {pct < 50 && (
          <div
            className={`absolute top-0 bottom-0 bg-gradient-to-r ${barColor} transition-all duration-700`}
            style={{
              right: `${50}%`,
              width: `${50 - pct}%`,
            }}
          />
        )}

        {/* Positive side (right) */}
        {pct > 50 && (
          <div
            className={`absolute top-0 bottom-0 bg-gradient-to-r ${barColor} transition-all duration-700`}
            style={{
              left: `${50}%`,
              width: `${pct - 50}%`,
            }}
          />
        )}
      </div>

      <div className={`text-center text-sm font-semibold ${textColor}`}>
        {kappa >= 0 ? "+" : ""}{kappa.toFixed(3)} ({pct.toFixed(1)}%)
      </div>
    </div>
  );
}

// ─── Interpretation Scale Component ────────────────────────────────────────

const scaleItems = [
  { range: "< 0", label: "أقل من الصدفة", color: "bg-red-500" },
  { range: "0.0 – 0.2", label: "ضعيف جداً", color: "bg-orange-500" },
  { range: "0.2 – 0.4", label: "ضعيف", color: "bg-yellow-500" },
  { range: "0.4 – 0.6", label: "معتدل", color: "bg-sky-500" },
  { range: "0.6 – 0.8", label: "جيد", color: "bg-blue-500" },
  { range: "0.8 – 1.0", label: "ممتاز", color: "bg-green-500" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IAADashboardV2() {
  const { user } = useAuth();
  const { data: allProjects } = trpc.projects.getAll.useQuery();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: cohen, isLoading: cohenLoading, refetch: refetchCohen } = trpc.iaa.cohenKappa.useQuery(
    { projectId: projectId! },
    { enabled: projectId !== null }
  );

  const { data: fleiss, isLoading: fleissLoading, refetch: refetchFleiss } = trpc.iaa.fleissKappa.useQuery(
    { projectId: projectId! },
    { enabled: projectId !== null }
  );

  // Prepare enhanced chart data
  const chartData = useMemo(() => {
    if (!cohen || !fleiss) return [];
    return [
      {
        name: "Cohen's Kappa",
        value: parseFloat((cohen.kappa ?? 0).toFixed(3)),
        agreement: cohen.agreement ?? 0,
        tasks: cohen.taskCount ?? 0,
        annotators: 2,
      },
      {
        name: "Fleiss' Kappa",
        value: parseFloat((fleiss.kappa ?? 0).toFixed(3)),
        agreement: fleiss.agreement ?? 0,
        tasks: fleiss.taskCount ?? 0,
        annotators: fleiss.annotatorCount ?? 0,
      },
    ];
  }, [cohen, fleiss]);

  // Prepare radar chart data
  const radarData = useMemo(() => {
    if (!cohen || !fleiss) return [];
    return [
      {
        metric: "Cohen's Kappa",
        value: Math.max(0, (cohen.kappa ?? 0) * 100),
        fullMark: 100,
      },
      {
        metric: "Fleiss' Kappa",
        value: Math.max(0, (fleiss.kappa ?? 0) * 100),
        fullMark: 100,
      },
      {
        metric: "الاتفاق المرصود",
        value: cohen.agreement ?? 0,
        fullMark: 100,
      },
    ];
  }, [cohen, fleiss]);

  // Handle export
  const handleExport = useCallback(() => {
    if (!cohen || !fleiss || !selectedProject) return;

    const data = {
      project: selectedProject.name,
      timestamp: new Date().toISOString(),
      cohen: {
        kappa: cohen.kappa,
        agreement: cohen.agreement,
        taskCount: cohen.taskCount,
        interpretation: cohen.interpretation,
      },
      fleiss: {
        kappa: fleiss.kappa,
        agreement: fleiss.agreement,
        annotatorCount: fleiss.annotatorCount,
        interpretation: fleiss.interpretation,
      },
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iaa-report-${projectId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cohen, fleiss, projectId]);

  if (!user || (user.role !== "admin" && user.role !== "qa")) {
    return (
      <ArabAnnotatorsDashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 font-semibold">ليس لديك صلاحية الوصول</p>
        </div>
      </ArabAnnotatorsDashboardLayout>
    );
  }

  const isLoading = cohenLoading || fleissLoading;
  const selectedProject = allProjects?.find((p) => p.id === projectId);
  const hasData = cohen && fleiss && (cohen.taskCount > 0 || fleiss.taskCount > 0);

  return (
    <ArabAnnotatorsDashboardLayout title="لوحة تحكم قياس الاتفاق بين الموسِّمين (IAA) v2">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Enhanced Project Selector */}
        <Card className="p-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-blue-200 shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                <label className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  اختر المشروع:
                </label>
                <Select onValueChange={(v) => setProjectId(Number(v))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="اختر مشروعاً لتحليله" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProjects?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                {projectId && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        refetchCohen();
                        refetchFleiss();
                      }}
                      disabled={isLoading}
                      className="gap-2"
                    >
                      <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                      تحديث
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      disabled={!hasData}
                      className="gap-2"
                    >
                      <Download size={16} />
                      تصدير
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="gap-2"
                    >
                      <Filter size={16} />
                      {showAdvanced ? "إخفاء" : "إظهار"} المتقدم
                    </Button>
                  </>
                )}
              </div>
            </div>

            {selectedProject && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 border-t border-blue-200">
                <div className="text-center">
                  <p className="text-xs text-gray-600">إجمالي المهام</p>
                  <p className="font-bold text-lg text-gray-900">{selectedProject.totalItems}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">المكتملة</p>
                  <p className="font-bold text-lg text-green-600">{selectedProject.completedItems}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">نسبة الإنجاز</p>
                  <p className="font-bold text-lg text-blue-600">
                    {selectedProject.totalItems > 0
                      ? ((selectedProject.completedItems / selectedProject.totalItems) * 100).toFixed(1)
                      : 0}
                    %
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">الموسِّمون</p>
                  <p className="font-bold text-lg text-purple-600">
                    {fleiss?.annotatorCount ?? 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">المهام المزدوجة</p>
                  <p className="font-bold text-lg text-orange-600">
                    {cohen?.taskCount ?? 0}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Empty State */}
        {!projectId && (
          <Card className="p-12 text-center">
            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-30 text-gray-400" />
            <p className="text-lg text-gray-500 font-medium">اختر مشروعاً لعرض مقاييس الاتفاق</p>
            <p className="text-sm text-gray-400 mt-2">سيتم حساب Cohen's Kappa و Fleiss' Kappa تلقائياً</p>
          </Card>
        )}

        {/* Loading State */}
        {projectId && isLoading && (
          <Card className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">جارٍ حساب مقاييس الاتفاق...</p>
          </Card>
        )}

        {/* Main Content */}
        {projectId && !isLoading && (
          <>
            {/* Enhanced Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KappaBadgeV2 kappa={cohen?.kappa ?? 0} label="Cohen's Kappa" />
              <KappaBadgeV2 kappa={fleiss?.kappa ?? 0} label="Fleiss' Kappa" />

              <Card className="p-6 border-l-4 border-l-green-500">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">الاتفاق المرصود</p>
                  <CheckCircle2 size={20} className="text-green-600" />
                </div>
                <div className="text-3xl font-bold text-gray-900">{cohen?.agreement ?? 0}%</div>
                <p className="text-xs text-gray-500 mt-2">نسبة الاتفاق الفعلي</p>
              </Card>

              <Card className="p-6 border-l-4 border-l-orange-500">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">جودة البيانات</p>
                  <Zap size={20} className="text-orange-600" />
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {hasData ? "✓" : "✗"}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {hasData ? "بيانات كافية" : "بحاجة لمزيد"}
                </p>
              </Card>
            </div>

            {/* Tabs for Different Views */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview" className="gap-2">
                  <BarChart3 size={16} />
                  نظرة عامة
                </TabsTrigger>
                <TabsTrigger value="comparison" className="gap-2">
                  <LineChartIcon size={16} />
                  مقارنة
                </TabsTrigger>
                <TabsTrigger value="advanced" className="gap-2">
                  <Target size={16} />
                  متقدم
                </TabsTrigger>
                <TabsTrigger value="scale" className="gap-2">
                  <CheckCircle2 size={16} />
                  المقياس
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {hasData && (
                  <>
                    {/* Kappa Bars */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Cohen's Kappa</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <KappaBarV2 kappa={cohen?.kappa ?? 0} maxHeight={250} />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Fleiss' Kappa</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <KappaBarV2 kappa={fleiss?.kappa ?? 0} maxHeight={250} />
                        </CardContent>
                      </Card>
                    </div>

                    {/* Comparison Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <BarChart3 size={20} className="text-blue-600" />
                          مقارنة مقاييس Kappa
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="w-full h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="value" fill="#3b82f6" name="Kappa" />
                              <Bar dataKey="agreement" fill="#10b981" name="الاتفاق %" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* Comparison Tab */}
              <TabsContent value="comparison" className="space-y-6">
                {hasData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">مقارنة الأداء</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="w-full h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
                            <Line type="monotone" dataKey="agreement" stroke="#10b981" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="space-y-6">
                {hasData && (
                  <>
                    {/* Radar Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Zap size={20} className="text-purple-600" />
                          تحليل متقدم
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="w-full h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarData}>
                              <PolarGrid />
                              <PolarAngleAxis dataKey="metric" />
                              <PolarRadiusAxis angle={90} domain={[0, 100]} />
                              <Radar name="القيمة" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                              <Tooltip />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Detailed Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Cohen's Kappa التفاصيل</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-gray-600">القيمة</span>
                            <span className="font-bold">{cohen?.kappa.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-gray-600">الاتفاق</span>
                            <span className="font-bold">{cohen?.agreement.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-gray-600">المهام المزدوجة</span>
                            <span className="font-bold">{cohen?.taskCount}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">التفسير</span>
                            <Badge variant="outline">{cohen?.interpretation}</Badge>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Fleiss' Kappa التفاصيل</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-gray-600">القيمة</span>
                            <span className="font-bold">{fleiss?.kappa.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-gray-600">الاتفاق</span>
                            <span className="font-bold">{fleiss?.agreement.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-gray-600">عدد الموسِّمين</span>
                            <span className="font-bold">{fleiss?.annotatorCount}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">التفسير</span>
                            <Badge variant="outline">{fleiss?.interpretation}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Scale Tab */}
              <TabsContent value="scale" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Info size={20} className="text-blue-600" />
                      مقياس تفسير Kappa
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {scaleItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                          <div className={`w-4 h-4 rounded ${item.color}`} />
                          <div className="flex-1">
                            <p className="font-semibold text-sm">{item.label}</p>
                            <p className="text-xs text-gray-500">{item.range}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
