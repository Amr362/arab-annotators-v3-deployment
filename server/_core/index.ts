import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import * as db from "../db";
import { startAllWorkers } from "../workers/all";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No available port found");
}

// ── DB migrations + bootstrap ───────────────────────────────────────────────
async function runStartupTasks() {
  try {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) {
      console.warn("[Startup] No DB connection — skipping migrations");
      return;
    }

    // Migration: add passwordHash column if missing
    await drizzleDb.execute(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" text` as any
    );
    // Migration 0004: AI feature flags
    await drizzleDb.execute(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "qaAiEnabled" boolean DEFAULT false` as any
    );
    await drizzleDb.execute(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "spamDetection" boolean DEFAULT false` as any
    );
    console.log("[Startup] DB schema up-to-date — AI flags added");

    // Bootstrap admin account from env vars (ADMIN_EMAIL + ADMIN_PASSWORD)
    if (ENV.adminEmail && ENV.adminPassword) {
      await db.bootstrapAdmin({
        name: ENV.adminName || "Admin",
        email: ENV.adminEmail,
        password: ENV.adminPassword,
      });
    }
  } catch (e) {
    console.warn("[Startup] Startup task warning:", e);
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
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
    // Basic protection: require SETUP_TOKEN env var if set
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
      // Only allow if no admins exist yet
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
      // Update last sign-in
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

  // ── Google OAuth (optional — only works if env vars set) ─────────────────
  registerOAuthRoutes(app);

  // ── tRPC ──────────────────────────────────────────────────────────────────
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  // ── Static / Vite ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ── Startup tasks ─────────────────────────────────────────────────────────
  await runStartupTasks();

  // ── Background workers (v4) ──────────────────────────────────────────────
  startAllWorkers();

  // ── Health check endpoint (duplicate removed, already defined above) ──────────
  // Removed duplicate health check endpoint

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${port} (NODE_ENV: ${process.env.NODE_ENV})`);
    console.log(`📍 Available at http://0.0.0.0:${port}`);
  });
}

startServer().catch(console.error);
