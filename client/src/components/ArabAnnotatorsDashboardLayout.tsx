import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, FileText, CheckCircle2, LogOut, Menu, X } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function ArabAnnotatorsDashboardLayout({ children, title }: DashboardLayoutProps) {
  const { user, logout, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setLocation] = useLocation();

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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Arab Annotators</h1>
          <p className="text-gray-300 mb-8">منصة تصنيف البيانات العربية الاحترافية</p>
          <Button size="lg" onClick={() => (window.location.href = getLoginUrl())}>
            تسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const isTasker = user.role === "tasker";
  const isQA = user.role === "qa";

  const navigationItems = [
    isAdmin && { label: "لوحة التحكم", icon: BarChart3, href: "/admin" },
    isAdmin && { label: "المستخدمون", icon: Users, href: "/admin/users" },
    isAdmin && { label: "المشاريع", icon: FileText, href: "/admin/projects" },
    isTasker && { label: "المهام", icon: FileText, href: "/tasker/tasks" },
    isTasker && { label: "إحصائياتي", icon: BarChart3, href: "/tasker/stats" },
    isQA && { label: "قائمة المراجعة", icon: CheckCircle2, href: "/qa/queue" },
    isQA && { label: "إحصائياتي", icon: BarChart3, href: "/qa/stats" },
  ].filter(Boolean) as Array<{ label: string; icon: any; href: string }>;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-[#0B0F1A] text-white transition-all duration-300 flex flex-col border-r border-white/5`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#00D4A8] to-[#38BDF8] text-[#0B0F1A] rounded-xl flex items-center justify-center font-bold shadow-[0_4px_16px_rgba(0,212,168,0.4)]">
              AA
            </div>
            {sidebarOpen && <span className="font-bold text-lg">Arab Annotators</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.href}
              onClick={() => setLocation(item.href)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 hover:text-[#00D4A8] transition-colors text-left group"
            >
              <item.icon size={20} className="group-hover:scale-110 transition-transform" />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-white/5">
          {sidebarOpen && (
            <div className="mb-4 p-3 bg-[#111827] border border-white/5 rounded-xl">
              <p className="text-sm font-bold text-white">{user.name}</p>
              <p className="text-xs text-[#00D4A8] capitalize mt-1">{user.role}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl"
            onClick={() => {
              logout();
              setLocation("/");
            }}
          >
            <LogOut size={18} />
            {sidebarOpen && <span className="ml-2 font-medium">تسجيل الخروج</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {title && <h1 className="text-2xl font-bold text-gray-900">{title}</h1>}
          </div>
          <div className="text-sm text-gray-600">
            {new Date().toLocaleDateString("ar-SA", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
