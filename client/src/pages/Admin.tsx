import { useAuth } from "@/_core/hooks/useAuth";
import ArabAnnotatorsDashboardLayout from "@/components/ArabAnnotatorsDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, FileText, CheckCircle2, TrendingUp } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: allUsers } = trpc.admin.getAllUsers.useQuery();
  const { data: allProjects } = trpc.projects.getAll.useQuery();

  if (user?.role !== "admin") {
    return (
      <ArabAnnotatorsDashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600 font-semibold">ليس لديك صلاحية الوصول إلى هذه الصفحة</p>
        </div>
      </ArabAnnotatorsDashboardLayout>
    );
  }

  const stats = [
    {
      title: "إجمالي المستخدمين",
      value: allUsers?.length || 0,
      icon: Users,
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "المشاريع النشطة",
      value: allProjects?.filter((p) => p.status === "active").length || 0,
      icon: FileText,
      color: "bg-green-100 text-green-600",
    },
    {
      title: "المهام المكتملة",
      value: allProjects?.reduce((sum, p) => sum + (p.completedItems || 0), 0) || 0,
      icon: CheckCircle2,
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "معدل الإنجاز",
      value:
        allProjects && allProjects.length > 0
          ? Math.round(
              (allProjects.reduce((sum, p) => sum + (p.completedItems || 0), 0) /
                allProjects.reduce((sum, p) => sum + (p.totalItems || 1), 1)) *
                100
            )
          : 0,
      icon: TrendingUp,
      color: "bg-orange-100 text-orange-600",
      suffix: "%",
    },
  ];

  return (
    <ArabAnnotatorsDashboardLayout title="لوحة التحكم">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <Icon size={20} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stat.value}
                    {stat.suffix}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>المشاريع الأخيرة</CardTitle>
          </CardHeader>
          <CardContent>
            {allProjects && allProjects.length > 0 ? (
              <div className="space-y-4">
                {allProjects.slice(0, 5).map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <p className="text-sm text-gray-600">
                        {project.completedItems} من {project.totalItems} مكتملة
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{
                            width: `${Math.round(
                              (project.completedItems / (project.totalItems || 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 mt-1 block">
                        {Math.round(
                          (project.completedItems / (project.totalItems || 1)) * 100
                        )}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">لا توجد مشاريع حالياً</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ArabAnnotatorsDashboardLayout>
  );
}
