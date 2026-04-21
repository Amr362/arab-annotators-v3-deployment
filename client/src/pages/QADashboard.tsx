import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { useState } from "react";

export default function QADashboard() {
  const { user } = useAuth();
  const [selectedReview, setSelectedReview] = useState<number | null>(null);

  // Fetch QA queue
  const { data: qaQueue, isLoading } = trpc.qa.getQueue.useQuery();

  // Fetch QA statistics
  const { data: stats } = trpc.qa.getStats.useQuery();

  if (!user || user.role !== "qa") {
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
              <p className="text-slate-600 mt-1">لوحة مراجع الجودة - QA Review</p>
            </div>
            <Badge className="bg-red-100 text-red-800">
              مراجع جودة
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
                <p className="text-slate-600 text-sm">المراجعات المعلقة</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.pendingReviews || 0}
                </p>
              </div>
              <AlertCircle className="w-10 h-10 text-yellow-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">المراجعات المكتملة</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.completedReviews || 0}
                </p>
              </div>
              <CheckCircle2 className="w-10 h-10 text-green-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">معدل الاتفاق (IAA)</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {stats?.agreementRate || 0}%
                </p>
              </div>
              <TrendingUp className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm">معدل الرفض</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  0%
                </p>
              </div>
              <XCircle className="w-10 h-10 text-red-500 opacity-20" />
            </div>
          </Card>
        </div>

        {/* QA Queue */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              قائمة المراجعة - QA Queue
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              مراجعة التوسيمات المزدوجة وحل النزاعات
            </p>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : qaQueue && qaQueue.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {qaQueue.map((review: any) => (
                <div
                  key={review.id}
                  className="p-6 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedReview(review.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Task #{review.taskId}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        الحالة: {review.status === 'approved' ? 'موافق عليه' : review.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                      </p>
                    </div>
                    <Badge
                      variant={
                        review.status === 'approved'
                          ? 'default'
                          : review.status === 'rejected'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {review.status === 'approved'
                        ? '✅ موافق'
                        : review.status === 'rejected'
                          ? '❌ مرفوض'
                          : '⏳ معلق'}
                    </Badge>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg mb-3">
                    <p className="text-sm text-slate-700">
                      <strong>الموسم الأول:</strong> {review.annotator1Result || 'لم يتم التوسيم'}
                    </p>
                    <p className="text-sm text-slate-700 mt-2">
                      <strong>الموسم الثاني:</strong> {review.annotator2Result || 'لم يتم التوسيم'}
                    </p>
                  </div>

                  {selectedReview === review.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200 flex gap-2">
                      <Button
                        className="flex-1 bg-green-500 hover:bg-green-600"
                        onClick={() => {
                          // Handle approval
                          console.log('Approved:', review.id);
                        }}
                      >
                        ✅ موافق
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          // Open review details
                          window.open(
                            `/label-studio/qa/${review.taskId}`,
                            '_blank'
                          );
                        }}
                      >
                        📋 مراجعة التفاصيل
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          // Handle rejection
                          console.log('Rejected:', review.id);
                        }}
                      >
                        ❌ مرفوض
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-600">
              <p>لا توجد مراجعات معلقة حالياً</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
