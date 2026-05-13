import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { InsertUser, users, projects, tasks, annotations, qaReviews, statistics, notifications, llmSuggestions } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from "bcryptjs";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: pg.Pool | null = null;

export async function getDb() {
  if (_db) return _db;
  
  const dbUrl = ENV.databaseUrl;

  if (!dbUrl) {
    console.error("[Database] CRITICAL: DATABASE_URL is missing!");
    return null;
  }

  try {
    if (!_pool) {
      // Handle cases where Railway might provide a URL without protocol
      const connectionString = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://') 
        ? dbUrl 
        : `postgresql://${dbUrl}`;

      const isSupabase = connectionString.includes('supabase.com');
      _pool = new pg.Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: (ENV.isProduction || isSupabase) ? { rejectUnauthorized: false } : false
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
      });

    return _db;
  } catch (error: any) {
    console.error("[Database] Init Error:", error.message);
    return null;
  }
}

// ── Bootstrap Admin ────────────────────────────────────────────────────────
export async function bootstrapAdmin(data: { name: string; email: string; password: string }) {
  const db = await getDb();
  if (!db) return;

  try {
    const passwordHash = await bcrypt.hash(data.password, 10);
    await db.insert(users).values({
      name: data.name,
      email: data.email,
      openId: `local-${data.email}`,
      role: "admin",
      loginMethod: "local",
      passwordHash,
      isActive: true,
    }).onConflictDoNothing();
    console.log(`[Bootstrap] Admin user ${data.email} ensured`);
  } catch (e) {
    console.warn("[Bootstrap] Failed to bootstrap admin:", e);
  }
}

// ── User Helpers ───────────────────────────────────────────────────────────
export async function getUserByIdentifier(identifier: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.email, identifier)).limit(1);
  return result[0] || null;
}

export async function verifyPassword(hash: string, plain: string) {
  return bcrypt.compare(plain, hash);
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
  const res = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
  return res[0];
}

// ── Missing Helpers for Routers ─────────────────────────────────────────────

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function createProjectWithTasks(data: {
  name: string;
  description?: string;
  createdBy: number;
  taskContents?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("DB offline");

  return await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      name: data.name,
      description: data.description ?? null,
      createdBy: data.createdBy,
      status: "active",
    }).returning();

    if (data.taskContents && data.taskContents.length > 0) {
      const taskValues = data.taskContents.map(content => ({
        projectId: project.id,
        content,
        status: "pending",
      }));
      // Insert in chunks if too many tasks
      const chunkSize = 100;
      for (let i = 0; i < taskValues.length; i += chunkSize) {
        await tx.insert(tasks).values(taskValues.slice(i, i + chunkSize));
      }
      await tx.update(projects).set({ totalItems: data.taskContents.length }).where(eq(projects.id, project.id));
    }

    return project;
  });
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ c: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(result[0]?.c ?? 0);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

export async function getTaskerFeedback(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(qaReviews)
    .innerJoin(annotations, eq(qaReviews.annotationId, annotations.id))
    .where(and(eq(annotations.userId, userId), ne(qaReviews.status, "approved")))
    .orderBy(desc(qaReviews.createdAt))
    .limit(20);
}

export async function assignTasksToUser(taskIds: number[], userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ assignedTo: userId, updatedAt: new Date() }).where(inArray(tasks.id, taskIds));
}

export async function getUnassignedTasks(projectId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.assignedTo))).limit(limit);
}

export async function resetUserPassword(userId: number, newPassword: string) {
  const db = await getDb();
  if (!db) return;
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getAdminStats() {
  const db = await getDb();
  if (!db) return { totalUsers: 0, totalProjects: 0, totalTasks: 0, totalAnnotations: 0 };
  const [u, p, t, a] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(projects),
    db.select({ c: count() }).from(tasks),
    db.select({ c: count() }).from(annotations),
  ]);
  return {
    totalUsers: Number(u[0]?.c ?? 0),
    totalProjects: Number(p[0]?.c ?? 0),
    totalTasks: Number(t[0]?.c ?? 0),
    totalAnnotations: Number(a[0]?.c ?? 0),
  };
}

export async function getLeaderboard() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    id: users.id,
    name: users.name,
    count: count(annotations.id),
  })
  .from(users)
  .leftJoin(annotations, eq(users.id, annotations.userId))
  .groupBy(users.id, users.name)
  .orderBy(desc(count(annotations.id)))
  .limit(10);
}
