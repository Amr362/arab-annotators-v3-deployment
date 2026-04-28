import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { InsertUser, users, projects, tasks, annotations, qaReviews, statistics, notifications, llmSuggestions } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: pg.Pool | null = null;

export async function getDb() {
  if (_db) return _db;
  
  // Force reading from process.env to ensure Railway variables are used over local .env files
  const dbUrl = process.env.DATABASE_URL || ENV.databaseUrl;

  if (!dbUrl) {
    console.error("[Database] CRITICAL: DATABASE_URL is missing!");
    return null;
  }

  try {
    if (!_pool) {
      const urlObj = new URL(dbUrl.startsWith('postgresql://') ? dbUrl : `postgresql://${dbUrl}`);
      console.log(`[Database] Connecting to: ${urlObj.hostname}:${urlObj.port}`);

      _pool = new pg.Pool({
        connectionString: dbUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        // Crucial for Railway: accept self-signed certificates
        ssl: {
          rejectUnauthorized: false
        }
      });

      _pool.on('error', (err) => {
        console.error('[Database] Pool Error:', err.message);
        _db = null;
        _pool = null;
      });
    }

    _db = drizzle(_pool);
    
    // Background connectivity test
    _pool.query('SELECT NOW()')
      .then((res) => console.log("[Database] Online! Server time:", res.rows[0].now))
      .catch(err => {
        console.error("[Database] Connectivity Check Failed:", err.message);
        if (err.message.includes('self-signed certificate')) {
          console.error("[Database] SSL Error: The server rejected the self-signed certificate. Ensure rejectUnauthorized is false.");
        }
      });

    return _db;
  } catch (error: any) {
    console.error("[Database] Init Error:", error.message);
    return null;
  }
}

// Helper to wrap DB operations with consistent logging
async function withDb<T>(op: (db: NonNullable<ReturnType<typeof drizzle>>) => Promise<T>, fallback: T, name: string): Promise<T> {
  const db = await getDb();
  if (!db) return fallback;
  try {
    return await op(db);
  } catch (error: any) {
    console.error(`[Database] ${name} error:`, error.message);
    return fallback;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;
  
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    
    textFields.forEach(field => {
      if (user[field] !== undefined) {
        values[field] = user[field] ?? null;
        updateSet[field] = user[field] ?? null;
      }
    });

    if (user.lastSignedIn) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error: any) {
    console.error("[Database] upsertUser failed:", error.message);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  return withDb(async (db) => {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  }, undefined, "getUserByOpenId");
}

export async function getUserById(id: number) {
  return withDb(async (db) => {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }, undefined, "getUserById");
}

export async function getAllUsers() {
  return withDb(async (db) => await db.select().from(users), [], "getAllUsers");
}

export async function getProjectById(id: number) {
  return withDb(async (db) => {
    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }, undefined, "getProjectById");
}

export async function getAllProjects() {
  return withDb(async (db) => await db.select().from(projects), [], "getAllProjects");
}

export async function getTasksByProject(projectId: number) {
  return withDb(async (db) => await db.select().from(tasks).where(eq(tasks.projectId, projectId)), [], "getTasksByProject");
}

export async function getTaskById(id: number) {
  return withDb(async (db) => {
    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0];
  }, undefined, "getTaskById");
}

export async function getAnnotationsByTask(taskId: number) {
  return withDb(async (db) => await db.select().from(annotations).where(eq(annotations.taskId, taskId)), [], "getAnnotationsByTask");
}

export async function getStatisticsByProject(projectId: number) {
  return withDb(async (db) => {
    const result = await db.select().from(statistics).where(eq(statistics.projectId, projectId)).limit(1);
    return result[0];
  }, undefined, "getStatisticsByProject");
}

export async function getNotificationsByUser(userId: number) {
  return withDb(async (db) => await db.select().from(notifications).where(eq(notifications.userId, userId)), [], "getNotificationsByUser");
}

export async function getTasksByAssignee(userId: number) {
  return withDb(async (db) => await db.select().from(tasks).where(eq(tasks.assignedTo, userId)), [], "getTasksByAssignee");
}

export async function getTaskerStats(userId: number) {
  return withDb(async (db) => {
    const userTasks = await db.select().from(tasks).where(eq(tasks.assignedTo, userId));
    const pendingCount = userTasks.filter(t => t.status === 'pending').length;
    const completedCount = userTasks.filter(t => t.status === 'submitted' || t.status === 'approved').length;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayAnnotations = await db.select({ c: count() }).from(annotations).where(and(eq(annotations.userId, userId), sql`${annotations.createdAt} >= ${todayStart}`));
    
    return {
      pendingCount,
      completedToday: Number(todayAnnotations[0]?.c ?? 0),
      accuracy: 0,
      totalCompleted: completedCount,
      completedCount,
      totalCount: userTasks.length,
    };
  }, { pendingCount: 0, completedToday: 0, accuracy: 0, totalCompleted: 0, completedCount: 0, totalCount: 0 }, "getTaskerStats");
}

export async function getQAQueue(reviewerId: number) {
  return withDb(async (db) => {
    return await db.select({
      id: annotations.id, taskId: annotations.taskId, userId: annotations.userId,
      taskerName: users.name, result: annotations.result, confidence: annotations.confidence,
      status: annotations.status, createdAt: annotations.createdAt, taskContent: tasks.content,
      projectId: tasks.projectId, projectName: projects.name, projectStatus: projects.status,
    })
    .from(annotations)
    .leftJoin(tasks, eq(annotations.taskId, tasks.id))
    .leftJoin(users, eq(annotations.userId, users.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(annotations.status, "pending_review"));
  }, [], "getQAQueue");
}

export async function getQAStats(reviewerId: number) {
  return withDb(async (db) => {
    const [pending, approved, rejected] = await Promise.all([
      db.select({ c: count() }).from(annotations).where(eq(annotations.status, "pending_review")),
      db.select({ c: count() }).from(qaReviews).where(and(eq(qaReviews.reviewerId, reviewerId), eq(qaReviews.status, "approved"))),
      db.select({ c: count() }).from(qaReviews).where(and(eq(qaReviews.reviewerId, reviewerId), eq(qaReviews.status, "rejected"))),
    ]);
    const appC = Number(approved[0]?.c ?? 0);
    const rejC = Number(rejected[0]?.c ?? 0);
    return {
      pendingReviews: Number(pending[0]?.c ?? 0),
      completedReviews: appC + rejC,
      approvedCount: appC,
      rejectedCount: rejC,
      agreementRate: (appC + rejC) > 0 ? Math.round((appC / (appC + rejC)) * 100) : 0,
    };
  }, { pendingReviews: 0, completedReviews: 0, approvedCount: 0, rejectedCount: 0, agreementRate: 0 }, "getQAStats");
}

export async function approveAnnotation(annotationId: number, reviewerId: number, feedback?: string) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  await db.insert(qaReviews).values({ annotationId, reviewerId, status: "approved", feedback: feedback ?? null });
  await db.update(annotations).set({ status: "approved", updatedAt: new Date() }).where(eq(annotations.id, annotationId));
  const ann = await db.select().from(annotations).where(eq(annotations.id, annotationId)).limit(1);
  if (ann[0]) {
    await db.update(tasks).set({ status: "approved", updatedAt: new Date() }).where(eq(tasks.id, ann[0].taskId));
    const task = await db.select().from(tasks).where(eq(tasks.id, ann[0].taskId)).limit(1);
    if (task[0]) await db.execute(sql`UPDATE projects SET "reviewedItems" = "reviewedItems" + 1, "updatedAt" = NOW() WHERE id = ${task[0].projectId}`);
  }
}

export async function rejectAnnotation(annotationId: number, reviewerId: number, feedback?: string) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  await db.insert(qaReviews).values({ annotationId, reviewerId, status: "rejected", feedback: feedback ?? null });
  await db.update(annotations).set({ status: "rejected", updatedAt: new Date() }).where(eq(annotations.id, annotationId));
  const ann = await db.select().from(annotations).where(eq(annotations.id, annotationId)).limit(1);
  if (ann[0]) await db.update(tasks).set({ status: "rejected", updatedAt: new Date() }).where(eq(tasks.id, ann[0].taskId));
}

export async function submitAnnotation(taskId: number, userId: number, result: any, confidence: number) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  await db.insert(annotations).values({ taskId, userId, result, confidence, status: "pending_review" });
  await db.update(tasks).set({ status: "submitted", updatedAt: new Date() }).where(eq(tasks.id, taskId));
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (task[0]) await db.execute(sql`UPDATE projects SET "completedItems" = "completedItems" + 1, "updatedAt" = NOW() WHERE id = ${task[0].projectId}`);
}

export async function createProject(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  const res = await db.insert(projects).values(data).returning(); return res[0];
}

export async function updateProject(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  const res = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning(); return res[0];
}

export async function deleteProject(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  await db.delete(projects).where(eq(projects.id, id));
}

export async function createTasks(data: any[]) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  return await db.insert(tasks).values(data).returning();
}

export async function updateTask(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  const res = await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id)).returning(); return res[0];
}

export async function deleteTasksByProject(projectId: number) {
  const db = await getDb(); if (!db) throw new Error("DB offline");
  await db.delete(tasks).where(eq(tasks.projectId, projectId));
}

export async function createNotification(data: any) {
  const db = await getDb(); if (!db) return;
  await db.insert(notifications).values(data).catch(() => {});
}

export async function markNotificationAsRead(id: number) {
  const db = await getDb(); if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).catch(() => {});
}

export async function getLLMSuggestions(taskId: number) {
  return withDb(async (db) => await db.select().from(llmSuggestions).where(eq(llmSuggestions.taskId, taskId)).orderBy(desc(llmSuggestions.createdAt)), [], "getLLMSuggestions");
}

export async function saveLLMSuggestion(taskId: number, suggestion: any, provider: string) {
  const db = await getDb(); if (!db) return;
  await db.insert(llmSuggestions).values({ taskId, suggestion, provider }).catch(() => {});
}

// Added missing functions for auth and bootstrap
import bcrypt from "bcryptjs";
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  if (stored.startsWith("$2")) {
    return await bcrypt.compare(supplied, stored);
  }
  return false;
}

export async function getUserByIdentifier(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;
  const lower = identifier.toLowerCase();
  const byEmail = await db.select().from(users).where(eq(users.email, lower)).limit(1);
  if (byEmail.length > 0) return byEmail[0];
  const byName = await db.select().from(users).where(eq(users.name, identifier)).limit(1);
  return byName.length > 0 ? byName[0] : undefined;
}

export async function bootstrapAdmin(opts: { name: string; email: string; password: string }) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (existing.length > 0) return;

  const openId = `local_${Date.now()}`;
  const passwordHash = await hashPassword(opts.password);

  await db.insert(users).values({
    openId,
    name: opts.name,
    email: opts.email.toLowerCase(),
    role: "admin",
    loginMethod: "local",
    passwordHash,
    isActive: true,
  });
  console.log(`[Bootstrap] Admin account created: ${opts.email}`);
}

export async function createProjectWithTasks(opts: {
  name: string;
  description?: string;
  createdBy: number;
  taskContents: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database offline");

  return await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      name: opts.name,
      description: opts.description ?? null,
      createdBy: opts.createdBy,
      totalItems: opts.taskContents.length,
      status: 'active',
    }).returning();

    if (opts.taskContents.length > 0) {
      const taskValues = opts.taskContents.map(content => ({
        projectId: project.id,
        content,
        status: 'CREATED' as const,
      }));
      await tx.insert(tasks).values(taskValues);
    }

    return project;
  });
}
