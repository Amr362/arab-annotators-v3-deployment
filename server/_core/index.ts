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
import { users as usersTable } from "../../drizzle/schema.ts";
import { eq } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => { server.close(() => resolve(true)); });
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No available port found");
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Auth & OAuth ───────────────────────────────────────────────────────────
  registerOAuthRoutes(app);

  // ── tRPC ───────────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── Health Check ───────────────────────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Vite / Static Files ────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ── Database Bootstrap ─────────────────────────────────────────────────────
  const database = await db.getDb();
  if (database) {
    try {
      // 1. Ensure admin user exists
      if (ENV.adminEmail && ENV.adminPassword) {
        await db.bootstrapAdmin({
          name: "Admin",
          email: ENV.adminEmail,
          password: ENV.adminPassword,
        });
      }

      // 2. Auto-promote owner if configured
      if (ENV.ownerOpenId) {
        await database
          .update(usersTable)
          .set({ role: "admin" })
          .where(eq(usersTable.openId, ENV.ownerOpenId));
      }

      // 3. Ensure system user for background tasks
      const SYSTEM_EMAIL = "system@arab-annotators.local";
      const existingSystem = await db.getUserByIdentifier(SYSTEM_EMAIL);
      if (!existingSystem) {
        await database.insert(usersTable).values({
          name: "System Worker",
          email: SYSTEM_EMAIL,
          openId: "system-worker",
          role: "admin",
          loginMethod: "local",
          passwordHash: "system-locked",
          isActive: true,
        }).onConflictDoNothing();
      }

      // 4. Ensure AI Assistant user
      const AI_EMAIL = "ai-assistant@arab-annotators.local";
      const existingAI = await db.getUserByIdentifier(AI_EMAIL);
      if (!existingAI) {
        await database.insert(usersTable).values({
          name: "AI Assistant",
          email: AI_EMAIL,
          openId: "ai-assistant",
          role: "admin",
          loginMethod: "local",
          passwordHash: "ai-locked",
          isActive: true,
        }).onConflictDoNothing();
      }
    } catch (error) {
      console.error("[Startup] Bootstrap failed:", error);
    }
  }

  // ── Background workers (v4) ──────────────────────────────────────────────
  startAllWorkers();

  // ── Health check endpoint (duplicate removed, already defined above) ──────────
  // Removed duplicate health check endpoint

  const PORT = Number(process.env.PORT) || 8080;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 Available at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
