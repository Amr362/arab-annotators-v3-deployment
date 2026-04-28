import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { InsertUser, users, projects, tasks, annotations, qaReviews, statistics, notifications, llmSuggestions } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: pg.Pool | null = null;

/**
 * Lazily create the drizzle instance.
 * Modified to be resilient: it won't block the app if the DB is slow to respond initially.
 */
export async function getDb() {
  if (_db) return _db;
  
  if (!ENV.databaseUrl) {
    console.error("[Database] DATABASE_URL is missing in environment variables");
    return null;
  }

  try {
    if (!_pool) {
      console.log("[Database] Initializing connection pool...");
      _pool = new pg.Pool({
        connectionString: ENV.databaseUrl,
        max: 20, 
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, 
      });

      _pool.on('error', (err) => {
        console.error('[Database] Unexpected error on idle client', err);
        // Reset so next call tries to re-initialize
        _db = null;
        _pool = null;
      });
    }

    _db = drizzle(_pool);
    
    // We initiate the connection test but don't 'await' it if we want to be fully non-blocking,
    // OR we wrap it in a try-catch to ensure we still return the _db instance even if it fails.
    // The user specifically wants to avoid the 10s timeout failure at startup.
    
    _pool.query('SELECT 1')
      .then(() => console.log("[Database] Connection established successfully"))
      .catch(err => console.warn("[Database] Connection test failed or timed out, but will retry on next query:", err.message));

    return _db;
  } catch (error) {
    console.error("[Database] Error during initialization:", error);
    return null;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users);
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(projects);
}

export async function getTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tasks).where(eq(tasks.projectId, projectId));
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAnnotationsByTask(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(annotations).where(eq(annotations.taskId, taskId));
}

export async function getStatisticsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(statistics).where(eq(statistics.projectId, projectId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getNotificationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(notifications).where(eq(notifications.userId, userId));
}

// Tasker functions
export async function getTasksByAssignee(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tasks).where(eq(tasks.assignedTo, userId));
}

export async function getTaskerStats(userId: number) {
  const db = await getDb();
  if (!db) return { pendingCount: 0, completedToday: 0, accuracy: 0, totalCompleted: 0, completedCount: 0, totalCount: 0 };

  const userTasks = await db.select().from(tasks).where(eq(tasks.assignedTo, userId));
  const pendingCount = userTasks.filter(t => t.status === 'pending').length;
  const completedCount = userTasks.filter(t => t.status === 'submitted' || t.status === 'approved').length;

  // Count annotations submitted today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayAnnotations = await db
    .select({ c: count() })
    .from(annotations)
    .where(and(eq(annotations.userId, userId), sql`${annotations.createdAt} >= ${todayStart}`));
  const completedToday = Number(todayAnnotations[0]?.c ?? 0);

  // Accuracy = approved / (approved + rejected) from QA reviews on this user's annotations
  const userAnnotations = await db.select({ id: annotations.id }).from(annotations).where(eq(annotations.userId, userId));
  const annIds = userAnnotations.map(a => a.id);
  let accuracy = 0;
  if (annIds.length > 0) {
    const reviews = await db
      .select({ status: qaReviews.status })
      .from(qaReviews)
      .where(inArray(qaReviews.annotationId, annIds));
    const approved = reviews.filter(r => r.status === 'approved').length;
    const reviewed = reviews.filter(r => r.status === 'approved' || r.status === 'rejected').length;
    accuracy = reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0;
  }

  return {
    pendingCount,
    completedToday,
    accuracy,
    totalCompleted: completedCount,
    completedCount,
    totalCount: userTasks.length,
  };
}

// QA functions
export async function getQAQueue(reviewerId: number) {
  const db = await getDb();
  if (!db) return [];
  // Return pending annotations that need review, joined with task content, tasker name, and project info
  // Using LEFT JOIN for everything to ensure annotations show up even if project/user is missing/deleted
  const rows = await db
    .select({
      id: annotations.id,
      taskId: annotations.taskId,
      userId: annotations.userId,
      taskerName: users.name,
      result: annotations.result,
      confidence: annotations.confidence,
      status: annotations.status,
      createdAt: annotations.createdAt,
      taskContent: tasks.content,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectStatus: projects.status,
    })
    .from(annotations)
    .leftJoin(tasks, eq(annotations.taskId, tasks.id))
    .leftJoin(users, eq(annotations.userId, users.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(annotations.status, "pending_review"));
  return rows;
}

export async function getQAStats(reviewerId: number) {
  const db = await getDb();
  if (!db) return { pendingReviews: 0, completedReviews: 0, approvedCount: 0, rejectedCount: 0, agreementRate: 0 };

  const [pending, approved, rejected] = await Promise.all([
    db.select({ c: count() }).from(annotations).where(eq(annotations.status, "pending_review")),
    db.select({ c: count() }).from(qaReviews).where(and(eq(qaReviews.reviewerId, reviewerId), eq(qaReviews.status, "approved"))),
    db.select({ c: count() }).from(qaReviews).where(and(eq(qaReviews.reviewerId, reviewerId), eq(qaReviews.status, "rejected"))),
  ]);

  const approvedCount = Number(approved[0]?.c ?? 0);
  const rejectedCount = Number(rejected[0]?.c ?? 0);
  const completedReviews = approvedCount + rejectedCount;

  // IAA: ratio of approved vs total completed reviews
  const agreementRate = completedReviews > 0 ? Math.round((approvedCount / completedReviews) * 100) : 0;

  return {
    pendingReviews: Number(pending[0]?.c ?? 0),
    completedReviews,
    approvedCount,
    rejectedCount,
    agreementRate,
  };
}

// Approve an annotation (QA)
export async function approveAnnotation(annotationId: number, reviewerId: number, feedback?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Insert QA review record
  await db.insert(qaReviews).values({
    annotationId,
    reviewerId,
    status: "approved",
    feedback: feedback ?? null,
  });

  // Update annotation status
  await db.update(annotations).set({ status: "approved", updatedAt: new Date() }).where(eq(annotations.id, annotationId));

  // Update the parent task status to approved
  const ann = await db.select().from(annotations).where(eq(annotations.id, annotationId)).limit(1);
  if (ann.length > 0) {
    await db.update(tasks).set({ status: "approved", updatedAt: new Date() }).where(eq(tasks.id, ann[0].taskId));
    // Update project completedItems counter
    const task = await db.select().from(tasks).where(eq(tasks.id, ann[0].taskId)).limit(1);
    if (task.length > 0) {
      await db.execute(sql`
        UPDATE projects SET "reviewedItems" = "reviewedItems" + 1, "updatedAt" = NOW()
        WHERE id = ${task[0].projectId}
      `);
    }
  }
}

// Reject an annotation (QA)
export async function rejectAnnotation(annotationId: number, reviewerId: number, feedback?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(qaReviews).values({
    annotationId,
    reviewerId,
    status: "rejected",
    feedback: feedback ?? null,
  });

  // Update annotation status
  await db.update(annotations).set({ status: "rejected", updatedAt: new Date() }).where(eq(annotations.id, annotationId));

  // Update the parent task status to rejected
  const ann = await db.select().from(annotations).where(eq(annotations.id, annotationId)).limit(1);
  if (ann.length > 0) {
    await db.update(tasks).set({ status: "rejected", updatedAt: new Date() }).where(eq(tasks.id, ann[0].taskId));
  }
}

export async function submitAnnotation(taskId: number, userId: number, result: any, confidence: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Insert annotation
  await db.insert(annotations).values({
    taskId,
    userId,
    result,
    confidence,
    status: "pending_review",
  });

  // Update task status
  await db.update(tasks).set({ status: "submitted", updatedAt: new Date() }).where(eq(tasks.id, taskId));

  // Update project counters
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (task.length > 0) {
    await db.execute(sql`
      UPDATE projects SET "completedItems" = "completedItems" + 1, "updatedAt" = NOW()
      WHERE id = ${task[0].projectId}
    `);
  }
}

export async function createProject(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data).returning();
  return result[0];
}

export async function updateProject(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
  return result[0];
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(eq(projects.id, id));
}

export async function createTasks(data: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(tasks).values(data).returning();
}

export async function updateTask(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id)).returning();
  return result[0];
}

export async function deleteTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tasks).where(eq(tasks.projectId, projectId));
}

export async function createNotification(data: any) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function getLLMSuggestions(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(llmSuggestions).where(eq(llmSuggestions.taskId, taskId)).orderBy(desc(llmSuggestions.createdAt));
}

export async function saveLLMSuggestion(taskId: number, suggestion: any, provider: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(llmSuggestions).values({
    taskId,
    suggestion,
    provider,
  });
}

// Trigger deployment on Railway - Resilience update confirmed.
