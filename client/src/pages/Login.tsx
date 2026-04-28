import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import AnimatedLogo from "@/components/AnimatedLogo";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Eye, EyeOff, Lock, User, Chrome } from "lucide-react";

type Mode = "login" | "setup";

export default function Login() {
  const { user, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();

  const [mode, setMode] = useState<Mode>("login");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasDb, setHasDb] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  // Detect setup status on mount
  useEffect(() => {
    fetch("/api/auth/setup-status")
      .then(r => r.json())
      .then(d => {
        setNeedsSetup(d.needsSetup);
        setHasDb(d.hasDb);
        if (d.needsSetup) setMode("setup");
      })
      .catch(() => {});

    // Check if Google OAuth is configured
    const gid = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    setGoogleEnabled(!!gid && gid.length > 10);
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (loading || !user) return;
    
    const currentPath = window.location.pathname;
    let targetPath = "/";
    
    if (user.role === "admin")        targetPath = "/admin";
    else if (user.role === "manager")  targetPath = "/manager";
    else if (user.role === "tasker")   targetPath = "/tasker/tasks";
    else if (user.role === "qa")       targetPath = "/qa/queue";
    
    // Only redirect if we are not already at the target path
    if (currentPath !== targetPath && (currentPath === "/" || currentPath === "/login")) {
      setLocation(targetPath);
    }
  }, [user?.role, loading, setLocation]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) { toast.error("أدخل اسم المستخدم وكلمة المرور"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "فشل تسجيل الدخول"); return; }
      toast.success(`مرحباً ${data.name || ""}! 👋`);
      await refresh();
    } catch {
      toast.error("خطأ في الاتصال — تحقق من الاتصال");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !identifier.trim() || !password || password.length < 6) {
      toast.error("يرجى ملء جميع الحقول (كلمة المرور 6 أحرف على الأقل)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "فشل الإعداد"); return; }
      toast.success("✅ تم إنشاء حساب المدير! مرحباً بك");
      await refresh();
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#00D4A8]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#00D4A8]/8 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#38BDF8]/8 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AnimatedLogo size="lg" animated={true} />
          </div>
          <h1 className="text-2xl font-bold text-white">Arab Annotators</h1>
          <p className="text-gray-500 text-sm mt-1">منصة تصنيف البيانات العربية</p>
        </div>

        {/* DB unavailable warning */}
        {!hasDb && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-4 text-red-300 text-sm text-center">
            ⚠️ قاعدة البيانات غير متاحة — تحقق من إعدادات DATABASE_URL على Railway
          </div>
        )}

        {/* Card */}
        <div className="bg-[#111827] border border-white/8 rounded-2xl p-7 shadow-2xl">

          {/* Setup mode */}
          {mode === "setup" && (
            <>
              <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl p-3 mb-5 text-amber-300 text-xs text-center">
                🚀 إعداد أولي — أنشئ حساب المدير الأول
              </div>
              <form onSubmit={handleSetup} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">الاسم الكامل</label>
                  <div className="relative">
                    <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: أحمد محمد"
                      className="bg-[#0B0F1A] border-white/10 text-white pr-9 focus:border-[#00D4A8] placeholder:text-gray-600" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">البريد الإلكتروني</label>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">@</span>
                    <Input type="email" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="admin@example.com"
                      className="bg-[#0B0F1A] border-white/10 text-white pr-7 focus:border-[#00D4A8] placeholder:text-gray-600" dir="ltr" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">كلمة المرور</label>
                  <div className="relative">
                    <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      className="bg-[#0B0F1A] border-white/10 text-white pr-9 pl-10 focus:border-[#00D4A8] placeholder:text-gray-600" />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-[#00D4A8] hover:bg-[#00A882] text-[#0B0F1A] font-bold rounded-xl py-5 mt-2">
                  {busy ? "جارٍ الإنشاء..." : "إنشاء حساب المدير"}
                </Button>
              </form>
              <button onClick={() => setMode("login")} className="w-full text-center text-gray-500 text-xs mt-4 hover:text-gray-300">
                لديك حساب؟ تسجيل الدخول
              </button>
            </>
          )}

          {/* Login mode */}
          {mode === "login" && (
            <>
              <h2 className="text-lg font-bold text-white mb-5 text-center">تسجيل الدخول</h2>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">اسم المستخدم أو البريد الإلكتروني</label>
                  <div className="relative">
                    <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <Input
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="admin أو annotator_01"
                      autoComplete="username"
                      className="bg-[#0B0F1A] border-white/10 text-white pr-9 focus:border-[#00D4A8] placeholder:text-gray-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">كلمة المرور</label>
                  <div className="relative">
                    <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <Input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="bg-[#0B0F1A] border-white/10 text-white pr-9 pl-10 focus:border-[#00D4A8] placeholder:text-gray-600"
                    />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={busy || !identifier || !password}
                  className="w-full bg-[#00D4A8] hover:bg-[#00A882] text-[#0B0F1A] font-bold rounded-xl py-5 mt-1 transition-all disabled:opacity-50"
                >
                  {busy ? "جارٍ الدخول..." : "دخول"}
                </Button>
              </form>

              {/* Google OAuth divider (only if configured) */}
              {googleEnabled && (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-white/8" />
                    <span className="text-gray-600 text-xs">أو</span>
                    <div className="flex-1 h-px bg-white/8" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl py-5 flex items-center justify-center gap-2"
                    onClick={() => { window.location.href = getLoginUrl(); }}
                  >
                    <Chrome size={16} />
                    تسجيل الدخول بـ Google
                  </Button>
                </>
              )}

              {/* Setup link if no admin */}
              {needsSetup && (
                <button onClick={() => setMode("setup")} className="w-full text-center text-amber-400 text-xs mt-4 hover:text-amber-300">
                  أول مرة؟ إعداد حساب المدير →
                </button>
              )}
            </>
          )}
        </div>

        {/* Help text */}
        <p className="text-center text-gray-600 text-xs mt-5 leading-relaxed">
          {mode === "login"
            ? "المصنفون: استخدموا اسم المستخدم الذي أعطاكم إياه المدير\nالمدير: استخدم البريد الإلكتروني وكلمة المرور"
            : "سيتم إنشاء حساب المدير الأول — لا يظهر هذا الخيار مرة أخرى"}
        </p>
      </div>
    </div>
  );
}
