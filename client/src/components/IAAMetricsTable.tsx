import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Users, CheckCircle2 } from "lucide-react";

interface IAAMetric {
  annotator1: string;
  annotator2: string;
  kappa: number;
  agreement: number;
  taskCount: number;
  interpretation: string;
}

interface IAAMetricsTableProps {
  metrics: IAAMetric[];
  title?: string;
  isLoading?: boolean;
}

function getKappaColor(kappa: number): string {
  if (kappa >= 0.8) return "bg-green-100 text-green-800";
  if (kappa >= 0.6) return "bg-blue-100 text-blue-800";
  if (kappa >= 0.4) return "bg-yellow-100 text-yellow-800";
  if (kappa >= 0.2) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function getKappaIcon(kappa: number) {
  if (kappa >= 0.8) return "✓";
  if (kappa >= 0.6) return "◐";
  if (kappa >= 0.4) return "◑";
  if (kappa >= 0.2) return "◒";
  return "✗";
}

export function IAAMetricsTable({
  metrics,
  title = "مقاييس الاتفاق بين المرمزين",
  isLoading = false,
}: IAAMetricsTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
            <p className="text-gray-500">جارٍ تحميل البيانات...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد بيانات متاحة</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="text-right">الموسِّم الأول</TableHead>
                <TableHead className="text-right">الموسِّم الثاني</TableHead>
                <TableHead className="text-center">Kappa</TableHead>
                <TableHead className="text-center">الاتفاق</TableHead>
                <TableHead className="text-center">المهام</TableHead>
                <TableHead className="text-right">التفسير</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric, idx) => (
                <TableRow key={idx} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="text-right font-medium text-gray-900">
                    {metric.annotator1}
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-900">
                    {metric.annotator2}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${getKappaColor(metric.kappa)} border-0`}>
                      {getKappaIcon(metric.kappa)} {metric.kappa.toFixed(3)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                          style={{ width: `${metric.agreement}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 min-w-[40px]">
                        {metric.agreement}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{metric.taskCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-600">
                    {metric.interpretation}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Statistics */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-gray-600 mb-1">متوسط Kappa</p>
              <p className="text-xl font-bold text-blue-600">
                {(metrics.reduce((sum, m) => sum + m.kappa, 0) / metrics.length).toFixed(3)}
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-gray-600 mb-1">متوسط الاتفاق</p>
              <p className="text-xl font-bold text-green-600">
                {(metrics.reduce((sum, m) => sum + m.agreement, 0) / metrics.length).toFixed(1)}%
              </p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-xs text-gray-600 mb-1">إجمالي المهام</p>
              <p className="text-xl font-bold text-purple-600">
                {metrics.reduce((sum, m) => sum + m.taskCount, 0)}
              </p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-xs text-gray-600 mb-1">عدد المقارنات</p>
              <p className="text-xl font-bold text-orange-600">
                {metrics.length}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
