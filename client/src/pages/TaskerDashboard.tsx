import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Clock, Zap } from "lucide-react";
import { useState } from "react";

export default function TaskerDashboard() {
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<number | null>(null);

  // Fetch tasker's assigned tasks
  const { data: tasks, isLoading } = trpc.tasker.getTasks.useQuery();

  // Fetch task statistics
  const { data: stats } = trpc.tasker.getStats.useQuery();

  if (!user || user.role !== "tasker") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">غير مصرح لك بالوصول</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                مرحباً {user.name}
              </h1>
              <p className="text-slate-600 mt-1">لوحة التاسكر - توسيم البيانات</p>
            </div>
            <Badge className="bg-amber-100 text-amber-800">
              موسِّم بيانات
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">المهام المتبقية</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.pendingCount || 0}
                </p>
              </div>
              <Clock className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">المكتملة اليوم</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.completedToday || 0}
                </p>
              </div>
              <CheckCircle2 className="w-10 h-10 text-green-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">معدل الدقة</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.accuracy || 0}%
                </p>
              </div>
              <Zap className="w-10 h-10 text-amber-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">الإجمالي المكتمل</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.totalCompleted || 0}
                </p>
              </div>
              <CheckCircle2 className="w-10 h-10 text-purple-500 opacity-20" />
            </div>
          </Card>
        </div>

        {/* Progress Bar */}
        <Card className="p-6 mb-8">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-900">التقدم الكلي</h3>
              <span className="text-sm text-slate-600">
                {stats?.completedCount || 0} من {stats?.totalCount || 0}
              </span>
            </div>
            <Progress
              value={
                stats?.totalCount
                  ? ((stats.completedCount || 0) / stats.totalCount) * 100
                  : 0
              }
              className="h-3"
            />
          </div>
        </Card>

        {/* Tasks List */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              المهام المتاحة للتوسيم
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : tasks && tasks.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-6 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedTask(task.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Task #{task.id}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        {task.content}
                      </p>
                    </div>
                    <Badge
                      variant={
                        task.status === "submitted" || task.status === "approved"
                          ? "default"
                          : task.status === "in_progress"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {task.status === "submitted" || task.status === "approved"
                        ? "مكتملة"
                        : task.status === "in_progress"
                          ? "قيد العمل"
                          : "جديدة"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>المشروع: {task.projectId}</span>
                    <span>
                      {task.status === "approved" || task.status === "submitted"
                        ? "مكتملة"
                        : "معلقة"}
                    </span>
                  </div>

                  {selectedTask === task.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <Button
                        className="w-full bg-amber-500 hover:bg-amber-600"
                        onClick={() => {
                          // Open Label Studio in iframe or new window
                          window.open(
                            `/label-studio/task/${task.labelStudioTaskId}`,
                            "_blank"
                          );
                        }}
                      >
                        ابدأ التوسيم الآن
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-600">
              <p>لا توجد مهام متاحة حالياً</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
