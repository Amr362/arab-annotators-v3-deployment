import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, TrendingUp, Users, CheckCircle2, BarChart3, LineChart as LineChartIcon, RefreshCw } from "lucide-react";
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
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// ─── Kappa Badge Component ────────────────────────────────────────────────────

function KappaBadge({ kappa }: { kappa: number }) {
  const pct = Math.round(kappa * 100);
  let color = "bg-red-100 text-red-700 border-red-200";
  let bgColor = "bg-red-50";
  
  if (kappa >= 0.8) {
    color = "bg-green-100 text-green-700 border-green-200";
    bgColor = "bg-green-50";
  } else if (kappa >= 0.6) {
    color = "bg-blue-100 text-blue-700 border-blue-200";
    bgColor = "bg-blue-50";
  } else if (kappa >= 0.4) {
    color = "bg-yellow-100 text-yellow-700 border-yellow-200";
    bgColor = "bg-yellow-50";
  } else if (kappa >= 0.2) {
    color = "bg-orange-100 text-orange-700 border-orange-200";
    bgColor = "bg-orange-50";
  }

  return (
    <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold border ${color} ${bgColor}`}>
      κ = {kappa.toFixed(3)}
    </span>
  );
}

// ─── Kappa Progress Bar Component ─────────────────────────────────────────────

function KappaBar({ kappa }: { kappa: number }) {
  const pct = Math.max(0, Math.min(100, ((kappa + 1) / 2) * 100)); // map [-1,1] → [0,100]
  let barColor = "bg-red-500";
  let textColor = "text-red-700";
  
  if (kappa >= 0.8) {
    barColor = "bg-green-500";
    textColor = "text-green-700";
  } else if (kappa >= 0.6) {
    barColor = "bg-blue-500";
    textColor = "text-blue-700";
  } else if (kappa >= 0.4) {
    barColor = "bg-yellow-500";
    textColor = "text-yellow-700";
  } else if (kappa >= 0.2) {
    barColor = "bg-orange-500";
    textColor = "text-orange-700";
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full h-6 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
        {/* Zero line at 50% */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-400 z-10" />
        {/* Bar fill */}
        <div
          className={`absolute top-0 bottom-0 transition-all duration-700 ${barColor} rounded-full`}
          style={{
            left: "50%",
            width: `${Math.abs(pct - 50)}%`,
            right: pct < 50 ? `${50 - pct}%` : "auto",
          }}
        />
      </div>
      <div className={`text-center text-sm font-semibold ${textColor}`}>
        {kappa >= 0 ? "+" : ""}{kappa.toFixed(3)} ({pct.toFixed(1)}%)
      </div>
    </div>
  );
}

// ─── Interpretation Scale Component ──────────────────────────────────────────

const scaleItems = [
  { range: "< 0", label: "أقل من الصدفة", color: "bg-red-500" },
  { range: "0.0 – 0.2", label: "ضعيف جداً", color: "bg-orange-500" },
  { range: "0.2 – 0.4", label: "ضعيف", color: "bg-yellow-500" },
  { range: "0.4 – 0.6", label: "معتدل", color: "bg-sky-500" },
  { range: "0.6 – 0.8", label: "جيد", color: "bg-blue-500" },
  { range: "0.8 – 1.0", label: "ممتاز", color: "bg-green-500" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IAADashboard() {
  const { user } = useAuth();
  const { data: allProjects } = trpc.projects.getAll.useQuery();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: cohen, isLoading: cohenLoading, refetch: refetchCohen } = trpc.iaa.cohenKappa.useQuery(
    { projectId: projectId! },
    { enabled: projectId !== null }
  );

  const { data: fleiss, isLoading: fleissLoading, refetch: refetchFleiss } = trpc.iaa.fleissKappa.useQuery(
    { projectId: projectId! },
    { enabled: projectId !== null }
  );

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!cohen || !fleiss) return [];
    return [
      {
        name: "Cohen's Kappa",
        value: parseFloat((cohen.kappa ?? 0).toFixed(3)),
        agreement: cohen.agreement ?? 0,
        tasks: cohen.taskCount ?? 0,
      },
      {
        name: "Fleiss' Kappa",
        value: parseFloat((fleiss.kappa ?? 0).toFixed(3)),
        agreement: fleiss.agreement ?? 0,
        tasks: fleiss.taskCount ?? 0,
      },
    ];
  }, [cohen, fleiss]);

  // Prepare interpretation data
  const interpretationData = useMemo(() => {
    return scaleItems.map((item) => ({
      ...item,
      min: parseFloat(item.range.split("–")[0].trim()),
    }));
  }, []);

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
    <ArabAnnotatorsDashboardLayout title="مقاييس الاتفاق بين الموسِّمين (IAA)">
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Project Selector */}
        <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
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
            {projectId && (
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
            )}
          </div>
          {selectedProject && (
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">إجمالي المهام</p>
                  <p className="font-bold text-lg text-gray-900">{selectedProject.totalItems}</p>
                </div>
                <div>
                  <p className="text-gray-600">المهام المكتملة</p>
                  <p className="font-bold text-lg text-green-600">{selectedProject.completedItems}</p>
                </div>
                <div>
                  <p className="text-gray-600">نسبة الإنجاز</p>
                  <p className="font-bold text-lg text-blue-600">
                    {selectedProject.totalItems > 0
                      ? ((selectedProject.completedItems / selectedProject.totalItems) * 100).toFixed(1)
                      : 0}
                    %
                  </p>
                </div>
              </div>
            </div>
          )}
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
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-6 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">Cohen's Kappa</p>
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <TrendingUp size={18} className="text-blue-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {cohen?.kappa.toFixed(3) ?? "—"}
                </div>
                <p className="text-xs text-gray-500">{cohen?.interpretation ?? ""}</p>
                <p className="text-xs text-gray-400 mt-2">{cohen?.taskCount ?? 0} مهمة مزدوجة</p>
              </Card>

              <Card className="p-6 border-l-4 border-l-purple-500">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">Fleiss' Kappa</p>
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Users size={18} className="text-purple-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {fleiss?.kappa.toFixed(3) ?? "—"}
                </div>
                <p className="text-xs text-gray-500">{fleiss?.interpretation ?? ""}</p>
                <p className="text-xs text-gray-400 mt-2">{fleiss?.annotatorCount ?? 0} موسِّم</p>
              </Card>

              <Card className="p-6 border-l-4 border-l-green-500">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">الاتفاق المرصود</p>
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle2 size={18} className="text-green-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {cohen?.agreement ?? 0}%
                </div>
                <p className="text-xs text-gray-500">نسبة الاتفاق الفعلي</p>
              </Card>

              <Card className="p-6 border-l-4 border-l-orange-500">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">جودة البيانات</p>
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <BarChart3 size={18} className="text-orange-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {hasData ? "جيدة" : "غير كافية"}
                </div>
                <p className="text-xs text-gray-500">
                  {hasData ? "بيانات كافية للتحليل" : "بحاجة لمزيد من البيانات"}
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
                <TabsTrigger value="details" className="gap-2">
                  <TrendingUp size={16} />
                  التفاصيل
                </TabsTrigger>
                <TabsTrigger value="scale" className="gap-2">
                  <CheckCircle2 size={16} />
                  المقياس
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {/* Kappa Comparison Chart */}
                {hasData && (
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
                            <YAxis domain={[-1, 1]} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#fff",
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                              {chartData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={
                                    entry.value >= 0.8
                                      ? "#10b981"
                                      : entry.value >= 0.6
                                      ? "#3b82f6"
                                      : entry.value >= 0.4
                                      ? "#eab308"
                                      : entry.value >= 0.2
                                      ? "#f97316"
                                      : "#ef4444"
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Agreement Comparison */}
                {hasData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">نسبة الاتفاق بين المرمزين</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700">Cohen's Kappa</span>
                            <Badge variant="outline">{cohen?.agreement ?? 0}%</Badge>
                          </div>
                          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, (cohen?.agreement ?? 0))}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700">Fleiss' Kappa</span>
                            <Badge variant="outline">{fleiss?.agreement ?? 0}%</Badge>
                          </div>
                          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, (fleiss?.agreement ?? 0))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Comparison Tab */}
              <TabsContent value="comparison" className="space-y-6">
                {hasData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <LineChartIcon size={20} className="text-purple-600" />
                        مقارنة المقاييس
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Cohen's Kappa Details */}
                        <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <h3 className="font-semibold text-gray-900">Cohen's Kappa (ثنائي)</h3>
                          <KappaBadge kappa={cohen?.kappa ?? 0} />
                          <KappaBar kappa={cohen?.kappa ?? 0} />
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-white p-3 rounded-lg">
                              <p className="text-gray-500 text-xs">المهام</p>
                              <p className="font-bold text-lg">{cohen?.taskCount ?? 0}</p>
                            </div>
                            <div className="bg-white p-3 rounded-lg">
                              <p className="text-gray-500 text-xs">الاتفاق</p>
                              <p className="font-bold text-lg">{cohen?.agreement ?? 0}%</p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {cohen?.interpretation}
                          </p>
                        </div>

                        {/* Fleiss' Kappa Details */}
                        <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                          <h3 className="font-semibold text-gray-900">Fleiss' Kappa (متعدد)</h3>
                          <KappaBadge kappa={fleiss?.kappa ?? 0} />
                          <KappaBar kappa={fleiss?.kappa ?? 0} />
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-white p-3 rounded-lg">
                              <p className="text-gray-500 text-xs">المهام</p>
                              <p className="font-bold text-lg">{fleiss?.taskCount ?? 0}</p>
                            </div>
                            <div className="bg-white p-3 rounded-lg">
                              <p className="text-gray-500 text-xs">الموسِّمون</p>
                              <p className="font-bold text-lg">{fleiss?.annotatorCount ?? 0}</p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {fleiss?.interpretation}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">معلومات تفصيلية</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Cohen's Kappa Detail */}
                    <div className="border-b pb-6">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-600" />
                        Cohen's Kappa — مقارنة بين موسِّمَين
                      </h3>
                      {cohen && cohen.taskCount > 0 ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <p className="text-sm text-gray-600 mb-1">قيمة Kappa</p>
                              <p className="text-2xl font-bold text-blue-600">{cohen.kappa.toFixed(3)}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                              <p className="text-sm text-gray-600 mb-1">نسبة الاتفاق</p>
                              <p className="text-2xl font-bold text-green-600">{cohen.agreement}%</p>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                              <p className="text-sm text-gray-600 mb-1">عدد المهام</p>
                              <p className="text-2xl font-bold text-purple-600">{cohen.taskCount}</p>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg">
                            {cohen.interpretation}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-400">
                          <p>لا توجد مهام مزدوجة التوسيم في هذا المشروع بعد</p>
                          <p className="text-xs mt-1">يحتاج Cohen's Kappa على الأقل مهمة واحدة موسَّمة من موسِّمَين مختلفَين</p>
                        </div>
                      )}
                    </div>

                    {/* Fleiss' Kappa Detail */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Users size={18} className="text-purple-600" />
                        Fleiss' Kappa — اتفاق متعدد الموسِّمين
                      </h3>
                      {fleiss && fleiss.taskCount > 0 ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                              <p className="text-sm text-gray-600 mb-1">قيمة Kappa</p>
                              <p className="text-2xl font-bold text-purple-600">{fleiss.kappa.toFixed(3)}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                              <p className="text-sm text-gray-600 mb-1">متوسط الاتفاق</p>
                              <p className="text-2xl font-bold text-green-600">{fleiss.agreement}%</p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <p className="text-sm text-gray-600 mb-1">عدد الموسِّمين</p>
                              <p className="text-2xl font-bold text-blue-600">{fleiss.annotatorCount}</p>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg">
                            {fleiss.interpretation}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-400">
                          <p>لا توجد مهام متعددة التوسيم بعد</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Scale Tab */}
              <TabsContent value="scale">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">مقياس تفسير Kappa (Landis & Koch)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {scaleItems.map((item) => (
                        <div
                          key={item.range}
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <div className={`w-4 h-4 rounded-full ${item.color} flex-shrink-0`} />
                          <div className="flex-1">
                            <p className="text-sm font-mono text-gray-600">{item.range}</p>
                            <p className="text-base font-semibold text-gray-900">{item.label}</p>
                          </div>
                          <Badge variant="outline">{item.range}</Badge>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        <strong>ملاحظة:</strong> مقياس Landis & Koch يوفر تفسيراً معياراً لقيم Kappa. القيمة 1.0 تعني اتفاق تام، بينما 0.0 تعني لا اتفاق أفضل من الصدفة. القيم السالبة تشير إلى اتفاق أقل من الصدفة.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Statistics Summary */}
            {hasData && (
              <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-lg">ملخص الإحصائيات</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">إجمالي المهام المحللة</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {(cohen?.taskCount ?? 0) + (fleiss?.taskCount ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">متوسط الاتفاق</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {(((cohen?.agreement ?? 0) + (fleiss?.agreement ?? 0)) / 2).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">متوسط Kappa</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {(((cohen?.kappa ?? 0) + (fleiss?.kappa ?? 0)) / 2).toFixed(3)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">جودة البيانات</p>
                      <p className="text-2xl font-bold text-green-600">
                        {((cohen?.kappa ?? 0) + (fleiss?.kappa ?? 0)) / 2 >= 0.6 ? "ممتازة" : "جيدة"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
