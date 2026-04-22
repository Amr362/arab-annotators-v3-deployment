import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, TrendingUp, Users, CheckCircle2 } from "lucide-react";

function KappaBadge({ kappa }: { kappa: number }) {
  const pct = Math.round(kappa * 100);
  let color = "bg-red-100 text-red-700 border-red-200";
  if (kappa >= 0.8) color = "bg-green-100 text-green-700 border-green-200";
  else if (kappa >= 0.6) color = "bg-blue-100 text-blue-700 border-blue-200";
  else if (kappa >= 0.4) color = "bg-yellow-100 text-yellow-700 border-yellow-200";
  else if (kappa >= 0.2) color = "bg-orange-100 text-orange-700 border-orange-200";

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${color}`}>
      κ = {kappa.toFixed(2)}
    </span>
  );
}

function KappaBar({ kappa }: { kappa: number }) {
  const pct = Math.max(0, Math.min(100, ((kappa + 1) / 2) * 100)); // map [-1,1] → [0,100]
  let barColor = "bg-red-400";
  if (kappa >= 0.8) barColor = "bg-green-500";
  else if (kappa >= 0.6) barColor = "bg-blue-500";
  else if (kappa >= 0.4) barColor = "bg-yellow-400";
  else if (kappa >= 0.2) barColor = "bg-orange-400";

  return (
    <div className="relative w-full h-5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
      {/* zero line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-400 z-10" />
      <div
        className={`absolute top-0 bottom-0 transition-all duration-700 ${barColor} rounded-full`}
        style={{ left: "50%", width: `${Math.abs(pct - 50)}%`, right: pct < 50 ? `${50 - pct}%` : "auto" }}
      />
    </div>
  );
}

const scaleItems = [
  { range: "< 0", label: "أقل من الصدفة", color: "bg-red-400" },
  { range: "0.0 – 0.2", label: "ضعيف جداً", color: "bg-orange-400" },
  { range: "0.2 – 0.4", label: "ضعيف", color: "bg-yellow-400" },
  { range: "0.4 – 0.6", label: "معتدل", color: "bg-sky-400" },
  { range: "0.6 – 0.8", label: "جيد", color: "bg-blue-500" },
  { range: "0.8 – 1.0", label: "ممتاز", color: "bg-green-500" },
];

export default function IAADashboard() {
  const { user } = useAuth();
  const { data: allProjects } = trpc.projects.getAll.useQuery();
  const [projectId, setProjectId] = useState<number | null>(null);

  const { data: cohen, isLoading: cohenLoading } = trpc.iaa.cohenKappa.useQuery(
    { projectId: projectId! },
    { enabled: projectId !== null }
  );
  const { data: fleiss, isLoading: fleissLoading } = trpc.iaa.fleissKappa.useQuery(
    { projectId: projectId! },
    { enabled: projectId !== null }
  );

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
  const selectedProject = allProjects?.find(p => p.id === projectId);

  return (
    <ArabAnnotatorsDashboardLayout title="مقاييس الاتفاق بين الموسِّمين (IAA)">
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Project selector */}
        <Card className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-gray-700 flex-shrink-0">اختر المشروع:</label>
            <Select onValueChange={(v) => setProjectId(Number(v))}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="اختر مشروعاً لتحليله" />
              </SelectTrigger>
              <SelectContent>
                {allProjects?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProject && (
              <span className="text-sm text-gray-500">
                {selectedProject.completedItems} مهمة مكتملة من {selectedProject.totalItems}
              </span>
            )}
          </div>
        </Card>

        {!projectId && (
          <div className="text-center py-16 text-gray-400">
            <TrendingUp className="w-14 h-14 mx-auto mb-4 opacity-30" />
            <p className="text-lg">اختر مشروعاً لعرض مقاييس الاتفاق</p>
          </div>
        )}

        {projectId && isLoading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-gray-500">جارٍ حساب مقاييس الاتفاق...</p>
          </div>
        )}

        {projectId && !isLoading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded-lg"><TrendingUp size={18} className="text-blue-600" /></div>
                  <p className="text-sm font-medium text-gray-600">Cohen's Kappa (ثنائي)</p>
                </div>
                <div className="text-3xl font-bold text-gray-900">{cohen?.kappa.toFixed(2) ?? "—"}</div>
                <p className="text-sm text-gray-500 mt-1">{cohen?.interpretation ?? ""}</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-100 rounded-lg"><Users size={18} className="text-purple-600" /></div>
                  <p className="text-sm font-medium text-gray-600">Fleiss' Kappa (متعدد)</p>
                </div>
                <div className="text-3xl font-bold text-gray-900">{fleiss?.kappa.toFixed(2) ?? "—"}</div>
                <p className="text-sm text-gray-500 mt-1">{fleiss?.interpretation ?? ""}</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-100 rounded-lg"><CheckCircle2 size={18} className="text-green-600" /></div>
                  <p className="text-sm font-medium text-gray-600">الاتفاق المرصود</p>
                </div>
                <div className="text-3xl font-bold text-gray-900">{cohen?.agreement ?? 0}%</div>
                <p className="text-sm text-gray-500 mt-1">على {cohen?.taskCount ?? 0} مهمة مزدوجة</p>
              </Card>
            </div>

            {/* Cohen's Kappa Detail */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-600" />
                  Cohen's Kappa — مقارنة بين موسِّمَين
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cohen && cohen.taskCount > 0 ? (
                  <>
                    <div className="flex items-center gap-4">
                      <KappaBadge kappa={cohen.kappa} />
                      <span className="text-gray-600 text-sm">{cohen.interpretation}</span>
                    </div>
                    <KappaBar kappa={cohen.kappa} />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-gray-500">المهام المحللة</p>
                        <p className="font-bold text-lg text-gray-900">{cohen.taskCount}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-gray-500">نسبة الاتفاق الفعلي</p>
                        <p className="font-bold text-lg text-gray-900">{cohen.agreement}%</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Cohen's Kappa يقيس الاتفاق بين موسِّمَين مع تصحيح الاتفاق بالصدفة. القيمة 1.0 تعني اتفاق تام، و0.0 تعني لا اتفاق أفضل من الصدفة.
                    </p>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>لا توجد مهام مزدوجة التوسيم في هذا المشروع بعد</p>
                    <p className="text-xs mt-1">يحتاج Cohen's Kappa على الأقل مهمة واحدة موسَّمة من موسِّمَين مختلفَين</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fleiss' Kappa Detail */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={18} className="text-purple-600" />
                  Fleiss' Kappa — اتفاق متعدد الموسِّمين
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fleiss && fleiss.taskCount > 0 ? (
                  <>
                    <div className="flex items-center gap-4">
                      <KappaBadge kappa={fleiss.kappa} />
                      <span className="text-gray-600 text-sm">{fleiss.interpretation}</span>
                    </div>
                    <KappaBar kappa={fleiss.kappa} />
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-gray-500">المهام المحللة</p>
                        <p className="font-bold text-lg text-gray-900">{fleiss.taskCount}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-gray-500">عدد الموسِّمين</p>
                        <p className="font-bold text-lg text-gray-900">{fleiss.annotatorCount}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-gray-500">متوسط الاتفاق</p>
                        <p className="font-bold text-lg text-gray-900">{fleiss.agreement}%</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Fleiss' Kappa يُعمَّم Cohen's Kappa ليشمل أكثر من موسِّمَين. مناسب عندما تكون كل مهمة موسَّمة من عدد مختلف من الموسِّمين.
                    </p>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>لا توجد مهام متعددة التوسيم بعد</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Interpretation Scale */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">مقياس تفسير Kappa (Landis & Koch)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {scaleItems.map((item) => (
                    <div key={item.range} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`} />
                      <div>
                        <p className="text-xs font-mono text-gray-500">{item.range}</p>
                        <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
