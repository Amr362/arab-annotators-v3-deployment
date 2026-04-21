import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { BarChart3, Users, FileText, CheckCircle2 } from "lucide-react";
import AnimatedLogo from "@/components/AnimatedLogo";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;

    // Redirect logged-in users to their dashboard
    if (user) {
      if (user.role === "admin") {
        setLocation("/admin");
      } else if (user.role === "tasker") {
        setLocation("/tasker/tasks");
      } else if (user.role === "qa") {
        setLocation("/qa/queue");
      }
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#F1F5F9] font-body overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00D4A8]/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#38BDF8]/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0B0F1A]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AnimatedLogo size="md" />
            <div className="flex flex-col">
              <span className="text-white font-bold text-lg leading-none">Arab Annotators</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Data Labeling Platform</span>
            </div>
          </div>
          <Button 
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl px-6"
            onClick={() => (window.location.href = getLoginUrl())}
          >
            تسجيل الدخول
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-24 relative">
        <div className="text-center mb-20">
          <div className="flex justify-center mb-10">
            <AnimatedLogo size="xl" animated={true} className="shadow-[0_0_50px_rgba(0,212,168,0.3)]" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tight leading-tight">
            منصة <span className="text-[#00D4A8]">تصنيف البيانات</span> العربية
          </h1>
          <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
            منصة احترافية لتصنيف وتعليق البيانات العربية بكفاءة عالية، مع أدوات متقدمة للإدارة والمراجعة وضمان الجودة وفق أعلى المعايير العالمية.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-[#00D4A8] hover:bg-[#00A882] text-[#0B0F1A] font-bold px-10 py-7 rounded-2xl shadow-[0_0_40px_rgba(0,212,168,0.2)] transition-all hover:scale-105 w-full sm:w-auto"
              onClick={() => (window.location.href = getLoginUrl())}
            >
              ابدأ الآن مجاناً
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-white/10 bg-white/5 hover:bg-white/10 text-white px-10 py-7 rounded-2xl w-full sm:w-auto"
            >
              تعرف على المزيد
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          <div className="bg-[#111827]/50 backdrop-blur border border-white/5 rounded-3xl p-8 hover:border-[#00D4A8]/30 transition-all group">
            <div className="w-14 h-14 bg-[#00D4A8]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Users className="text-[#00D4A8]" size={28} />
            </div>
            <h3 className="text-white font-bold text-xl mb-3">إدارة المستخدمين</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              إنشاء وإدارة حسابات المصنفين والمراجعين بسهولة مع تتبع دقيق للأداء والإنتاجية.
            </p>
          </div>

          <div className="bg-[#111827]/50 backdrop-blur border border-white/5 rounded-3xl p-8 hover:border-[#38BDF8]/30 transition-all group">
            <div className="w-14 h-14 bg-[#38BDF8]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileText className="text-[#38BDF8]" size={28} />
            </div>
            <h3 className="text-white font-bold text-xl mb-3">إدارة المشاريع</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              إنشاء ومتابعة مشاريع التصنيف مع تتبع التقدم في الوقت الفعلي وإدارة الموارد.
            </p>
          </div>

          <div className="bg-[#111827]/50 backdrop-blur border border-white/5 rounded-3xl p-8 hover:border-[#8B5CF6]/30 transition-all group">
            <div className="w-14 h-14 bg-[#8B5CF6]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="text-[#8B5CF6]" size={28} />
            </div>
            <h3 className="text-white font-bold text-xl mb-3">مراجعة الجودة</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              نظام متقدم لمراجعة وضمان جودة التصنيفات وفق معايير دقيقة وقابلة للتخصيص.
            </p>
          </div>

          <div className="bg-[#111827]/50 backdrop-blur border border-white/5 rounded-3xl p-8 hover:border-[#F59E0B]/30 transition-all group">
            <div className="w-14 h-14 bg-[#F59E0B]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <BarChart3 className="text-[#F59E0B]" size={28} />
            </div>
            <h3 className="text-white font-bold text-xl mb-3">الإحصائيات</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              تقارير شاملة وإحصائيات مفصلة عن التقدم والإنتاجية والجودة لكل مشروع ومستخدم.
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center mb-24">
          <div className="p-10 rounded-3xl bg-[#111827]/30 border border-white/5 backdrop-blur-sm">
            <div className="text-5xl font-bold text-[#00D4A8] mb-3">30+</div>
            <p className="text-gray-400 font-medium text-lg">مصنف ومراجع محترف</p>
          </div>
          <div className="p-10 rounded-3xl bg-[#111827]/30 border border-white/5 backdrop-blur-sm">
            <div className="text-5xl font-bold text-[#38BDF8] mb-3">100%</div>
            <p className="text-gray-400 font-medium text-lg">دقة في تصنيف البيانات</p>
          </div>
          <div className="p-10 rounded-3xl bg-[#111827]/30 border border-white/5 backdrop-blur-sm">
            <div className="text-5xl font-bold text-[#F59E0B] mb-3">24/7</div>
            <p className="text-gray-400 font-medium text-lg">دعم فني وتطوير مستمر</p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-[#00D4A8] to-[#00A882] rounded-[2.5rem] p-16 text-center relative overflow-hidden shadow-[0_20px_50px_rgba(0,212,168,0.15)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent)] pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-[#0B0F1A] mb-8">
              جاهز للبدء في مشروعك القادم؟
            </h2>
            <p className="text-[#0B0F1A]/80 mb-12 max-w-2xl mx-auto text-xl font-medium">
              انضم إلى منصة Arab Annotators وكن جزءاً من مشروع تصنيف البيانات العربية الأكبر والأكثر احترافية في المنطقة.
            </p>
            <Button
              size="lg"
              className="bg-[#0B0F1A] text-white hover:bg-[#1C2333] px-12 py-8 rounded-2xl font-bold text-xl transition-all hover:scale-105 shadow-2xl"
              onClick={() => (window.location.href = getLoginUrl())}
            >
              تسجيل الدخول الآن
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
          <p>&copy; 2026 Arab Annotators. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
