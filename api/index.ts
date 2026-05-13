import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import * as db from "../server/db";
import { sdk } from "../server/_core/sdk";
import { ENV } from "../server/_core/env";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { getSessionCookieOptions } from "../server/_core/cookies";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ── Health check ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", time: new Date().toISOString() });
});

// ── Auth: check if setup is needed ───────────────────────────────────────
app.get("/api/auth/setup-status", async (_req, res) => {
  try {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) { res.json({ needsSetup: true, hasDb: false }); return; }
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const admins = await drizzleDb.select().from(users).where(eq(users.role, "admin")).limit(1);
    res.json({ needsSetup: admins.length === 0, hasDb: true });
  } catch {
    res.json({ needsSetup: true, hasDb: false });
  }
});

// ── Auth: first-time setup (create first admin) ───────────────────────────
app.post("/api/auth/setup", async (req, res) => {
  const { name, email, password, setupToken } = req.body ?? {};
  const expectedToken = process.env.SETUP_TOKEN;
  if (expectedToken && setupToken !== expectedToken) {
    res.status(403).json({ error: "رمز الإعداد غير صحيح" });
    return;
  }
  if (!name || !email || !password || password.length < 6) {
    res.status(400).json({ error: "يرجى ملء جميع الحقول (كلمة المرور 6 أحرف على الأقل)" });
    return;
  }
  try {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) { res.status(503).json({ error: "قاعدة البيانات غير متاحة" }); return; }
    const { users: usersTable } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const existing = await drizzleDb.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "المدير موجود بالفعل — استخدم صفحة تسجيل الدخول" }); return; }
    await db.bootstrapAdmin({ name, email, password });
    const user = await db.getUserByIdentifier(email);
    if (!user) { res.status(500).json({ error: "فشل إنشاء الحساب" }); return; }
    const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "" });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true, role: user.role });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "فشل الإعداد" });
  }
});

// ── Auth: local login (username or email + password) ─────────────────────
app.post("/api/auth/local", async (req, res) => {
  const { identifier, password } = req.body ?? {};
  if (!identifier || !password) {
    res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
    return;
  }
  try {
    const user = await db.getUserByIdentifier(String(identifier).trim());
    if (!user || user.loginMethod !== "local") {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: "هذا الحساب موقوف — تواصل مع المدير" });
      return;
    }
    if (!user.passwordHash) {
      res.status(401).json({ error: "لم يتم تعيين كلمة مرور — تواصل مع المدير" });
      return;
    }
    const valid = await db.verifyPassword(user.passwordHash, password);
    if (!valid) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    const drizzleDb = await db.getDb();
    if (drizzleDb) {
      const { users: usersTable } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await drizzleDb.update(usersTable).set({ lastSignedIn: new Date() }).where(eq(usersTable.id, user.id));
    }
    const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "" });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true, role: user.role, name: user.name });
  } catch (err) {
    console.error("[LocalAuth]", err);
    res.status(500).json({ error: "خطأ في الخادم — حاول مجدداً" });
  }
});

// ── Auth: logout ──────────────────────────────────────────────────────────
app.post("/api/auth/logout", (req, res) => {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
  res.json({ success: true });
});

// ── Google OAuth ──────────────────────────────────────────────────────────
registerOAuthRoutes(app);

// ── tRPC ──────────────────────────────────────────────────────────────────
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

export default app;
