import * as React from "react";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import {
  BarChart3, Users, FileText, CheckCircle2, LogOut, Bell, TrendingUp,
  Moon, Sun, ChevronRight, ChevronLeft, X, Code2, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function ArabAnnotatorsDashboardLayout({ children, title }: DashboardLayoutProps) {
  const { user, logout, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [location, setLocation] = useLocation();

  const { data: notifications, refetch: refetchNotifs } = trpc.notifications.getByUser.useQuery(
    undefined, { enabled: !!user, refetchInterval: 30_000 }
  );
  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery(
    undefined, { enabled: !!user, refetchInterval: 30_000 }
  );
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => refetchNotifs() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => refetchNotifs() });

  const unreadCount = unreadData?.count ?? 0;
  const sortedNotifs = React.useMemo(() =>
    [...(notifications || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notifications]);

  React.useEffect(() => {
    if (!loading && !user) setLocation("/login");
  }, [user, loading, setLocation]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F6FA]">
        <div className="text-center">
          <div className="w-10 h-10 bg-gradient-to-br from-[#00D4A8] to-[#0EA5E9] rounded-xl flex items-center justify-center font-black text-white text-sm mx-auto mb-4 animate-pulse shadow-lg">
            AA
          </div>
          <p className="text-slate-400 text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const isTasker = user.role === "tasker";
  const isQA = user.role === "qa";

  const navigationItems = [
    // Admin Items
    isAdmin && { label: "نظرة عامة",     icon: BarChart3,    href: "/admin" },
    isAdmin && { label: "إدارة المستخدمين", icon: Users,        href: "/admin/users" },
    isAdmin && { label: "إدارة المشاريع",   icon: FileText,     href: "/admin/projects" },
    isAdmin && { label: "منشئ الواجهات", icon: Code2,        href: "/admin/interface" },
    
    // Manager Items (v4)
    (isManager || isAdmin) && { label: "لوحة المدير",     icon: Briefcase,    href: "/manager" },
    (isManager || isAdmin) && { label: "إدارة المشاريع", icon: FileText,      href: "/manager/projects" },

    // Tasker Items
    (isTasker || isAdmin) && { label: "مهام التوسيم", icon: FileText,     href: "/tasker/tasks" },
    
    // QA Items
    (isQA || isAdmin) && { label: "مراجعة الجودة", icon: CheckCircle2, href: "/qa/queue" },
    
    // Shared Analytics
    (isQA || isAdmin) && { label: "مقاييس IAA",    icon: TrendingUp,   href: "/iaa" },
  ].filter(Boolean) as Array<{ label: string; icon: any; href: string }>;

  function notifTypeIcon(type: string) {
    if (type === "progress") return "📊";
    if (type === "quality_alert") return "⚠️";
    if (type === "review_request") return "🔍";
    return "🔔";
  }

  const roleLabel: Record<string, string> = {
    admin: "مسؤول", manager: "مدير مشاريع", tasker: "موسِّم", qa: "مراجع الجودة"
  };

  return (
    <div className="flex h-screen bg-[#F4F6FA] overflow-hidden" dir="rtl"
      style={{ fontFamily: "'IBM Plex Sans Arabic', 'Noto Sans Arabic', system-ui, sans-serif" }}>

      {/* ─── Sidebar ─── */}
      <aside className={cn(
        "flex flex-col bg-[#0D1117] border-l border-white/[0.06] transition-all duration-300 flex-shrink-0",
        sidebarOpen ? "w-[240px]" : "w-[60px]"
      )}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#00D4A8] to-[#0EA5E9] rounded-xl flex items-center justify-center font-black text-[#0D1117] text-sm flex-shrink-0 shadow-[0_0_20px_rgba(0,212,168,0.25)]">
            AA
          </div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm">Arab Annotators</p>
              <p className="text-white/25 text-[11px]">منصة التوسيم</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(s => !s)} className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mr-auto">
            {sidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navigationItems.map(item => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <button key={item.href} onClick={() => setLocation(item.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all",
                  isActive ? "bg-[#00D4A8]/10 text-[#00D4A8] border border-[#00D4A8]/15" : "text-white/35 hover:text-white/70 hover:bg-white/5",
                  !sidebarOpen && "justify-center px-2"
                )}>
                <item.icon size={17} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-right">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="p-3 border-t border-white/[0.06]">
          {sidebarOpen && (
            <div className="mb-2 px-3 py-2.5 bg-white/[0.04] rounded-xl">
              <p className="text-white font-semibold text-sm truncate">{user.name}</p>
              <p className="text-[#00D4A8] text-[11px] mt-0.5">{roleLabel[user.role] ?? user.role}</p>
            </div>
          )}
          <button onClick={() => { logout(); setLocation("/login"); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all text-[13px] font-medium",
              !sidebarOpen && "justify-center"
            )}>
            <LogOut size={16} />
            {sidebarOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {title && <h1 className="text-base font-bold text-slate-800">{title}</h1>}
          {!title && <div />}

          <div className="flex items-center gap-2">
            <button onClick={toggleTheme}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700">
              {theme === "dark" ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
            </button>

            {/* Bell */}
            <div className="relative">
              <button onClick={() => setNotifOpen(o => !o)}
                className="relative p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute left-0 top-11 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="font-semibold text-slate-800 text-sm">الإشعارات</span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button onClick={() => markAllRead.mutate()} className="text-xs text-[#00D4A8] hover:underline">
                          تحديد الكل
                        </button>
                      )}
                      <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {sortedNotifs.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-sm">لا توجد إشعارات</div>
                    ) : sortedNotifs.map(n => (
                      <div key={n.id} onClick={() => !n.isRead && markRead.mutate({ id: n.id })}
                        className={cn("px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors",
                          !n.isRead && "bg-sky-50/50")}>
                        <div className="flex items-start gap-2">
                          <span className="text-sm mt-0.5">{notifTypeIcon(n.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm", !n.isRead ? "font-semibold text-slate-800" : "text-slate-600")}>{n.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.content}</p>
                            <p className="text-[10px] text-slate-300 mt-1">
                              {new Date(n.createdAt).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          {!n.isRead && <span className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className="text-xs text-slate-400">
              {new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
        </header>

        {notifOpen && <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />}

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
