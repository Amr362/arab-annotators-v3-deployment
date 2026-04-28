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
      console.log("[Database] Initializing connection pool with URL:", ENV.databaseUrl.split('@')[1] || "hidden");
      
      const isProduction = process.env.NODE_ENV === "production" || ENV.databaseUrl.includes('rlwy.net');

      _pool = new pg.Pool({
        connectionString: ENV.databaseUrl,
        max: 20, 
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, 
        // Enable SSL for Railway connections
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      });

      _pool.on('error', (err) => {
        console.error('[Database] Unexpected error on idle client:', err.message);
        // Reset so next call tries to re-initialize
        _db = null;
        _pool = null;
      });
    }

    _db = drizzle(_pool);
    
    // We initiate the connection test but don't 'await' it to avoid blocking startup.
    _pool.query('SELECT 1')
      .then(() => console.log("[Database] Connection test: SUCCESS"))
      .catch(err => {
        console.error("[Database] Connection test: FAILED");
        console.error("[Database] Error details:", err.message);
        console.warn("[Database] The app will continue, but queries might fail until DB is reachable.");
      });

    return _db;
  } catch (error: any) {
    console.error("[Database] Error during initialization:", error.message);
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
  } catch (error: any) {
    console.error("[Database] Failed to upsert user:", error.message);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  try {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error: any) {
    console.error("[Database] getUserByOpenId query failed:", error.message);
    return undefined;
  }
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error: any) {
    console.error("[Database] getUserById query failed:", error.message);
    return undefined;
  }
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(users);
  } catch (error: any) {
    console.error("[Database] getAllUsers query failed:", error.message);
    return [];
  }
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error: any) {
    console.error("[Database] getProjectById query failed:", error.message);
    return undefined;
  }
}

export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(projects);
  } catch (error: any) {
    console.error("[Database] getAllProjects query failed:", error.message);
    return [];
  }
}

export async function getTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  } catch (error: any) {
    console.error("[Database] getTasksByProject query failed:", error.message);
    return [];
  }
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error: any) {
    console.error("[Database] getTaskById query failed:", error.message);
    return undefined;
  }
}

export async function getAnnotationsByTask(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(annotations).where(eq(annotations.taskId, taskId));
  } catch (error: any) {
    console.error("[Database] getAnnotationsByTask query failed:", error.message);
    return [];
  }
}

export async function getStatisticsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(statistics).where(eq(statistics.projectId, projectId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error: any) {
    console.error("[Database] getStatisticsByProject query failed:", error.message);
    return undefined;
  }
}

export async function getNotificationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(notifications).where(eq(notifications.userId, userId));
  } catch (error: any) {
    console.error("[Database] getNotificationsByUser query failed:", error.message);
    return [];
  }
}

// Tasker functions
export async function getTasksByAssignee(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(tasks).where(eq(tasks.assignedTo, userId));
  } catch (error: any) {
    console.error("[Database] getTasksByAssignee query failed:", error.message);
    return [];
  }
}

export async function getTaskerStats(userId: number) {
  const db = await getDb();
  if (!db) return { pendingCount: 0, completedToday: 0, accuracy: 0, totalCompleted: 0, completedCount: 0, totalCount: 0 };

  try {
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
  } catch (error: any) {
    console.error("[Database] getTaskerStats query failed:", error.message);
    return { pendingCount: 0, completedToday: 0, accuracy: 0, totalCompleted: 0, completedCount: 0, totalCount: 0 };
  }
}

// QA functions
export async function getQAQueue(reviewerId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
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
  } catch (error: any) {
    console.error("[Database] getQAQueue query failed:", error.message);
    return [];
  }
}

export async function getQAStats(reviewerId: number) {
  const db = await getDb();
  if (!db) return { pendingReviews: 0, completedReviews: 0, approvedCount: 0, rejectedCount: 0, agreementRate: 0 };

  try {
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
  } catch (error: any) {
    console.error("[Database] getQAStats query failed:", error.message);
    return { pendingReviews: 0, completedReviews: 0, approvedCount: 0, rejectedCount: 0, agreementRate: 0 };
  }
}

// Approve an annotation (QA)
export async function approveAnnotation(annotationId: number, reviewerId: number, feedback?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
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
  } catch (error: any) {
    console.error("[Database] approveAnnotation operation failed:", error.message);
    throw error;
  }
}

// Reject an annotation (QA)
export async function rejectAnnotation(annotationId: number, reviewerId: number, feedback?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
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
  } catch (error: any) {
    console.error("[Database] rejectAnnotation operation failed:", error.message);
    throw error;
  }
}

export async function submitAnnotation(taskId: number, userId: number, result: any, confidence: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
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
  } catch (error: any) {
    console.error("[Database] submitAnnotation operation failed:", error.message);
    throw error;
  }
}

export async function createProject(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const result = await db.insert(projects).values(data).returning();
    return result[0];
  } catch (error: any) {
    console.error("[Database] createProject operation failed:", error.message);
    throw error;
  }
}

export async function updateProject(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const result = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return result[0];
  } catch (error: any) {
    console.error("[Database] updateProject operation failed:", error.message);
    throw error;
  }
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.delete(projects).where(eq(projects.id, id));
  } catch (error: any) {
    console.error("[Database] deleteProject operation failed:", error.message);
    throw error;
  }
}

export async function createTasks(data: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    return await db.insert(tasks).values(data).returning();
  } catch (error: any) {
    console.error("[Database] createTasks operation failed:", error.message);
    throw error;
  }
}

export async function updateTask(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const result = await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id)).returning();
    return result[0];
  } catch (error: any) {
    console.error("[Database] updateTask operation failed:", error.message);
    throw error;
  }
}

export async function deleteTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
  } catch (error: any) {
    console.error("[Database] deleteTasksByProject operation failed:", error.message);
    throw error;
  }
}

export async function createNotification(data: any) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(notifications).values(data);
  } catch (error: any) {
    console.error("[Database] createNotification operation failed:", error.message);
  }
}

export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  } catch (error: any) {
    console.error("[Database] markNotificationAsRead operation failed:", error.message);
  }
}

export async function getLLMSuggestions(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(llmSuggestions).where(eq(llmSuggestions.taskId, taskId)).orderBy(desc(llmSuggestions.createdAt));
  } catch (error: any) {
    console.error("[Database] getLLMSuggestions query failed:", error.message);
    return [];
  }
}

export async function saveLLMSuggestion(taskId: number, suggestion: any, provider: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(llmSuggestions).values({
      taskId,
      suggestion,
      provider,
    });
  } catch (error: any) {
    console.error("[Database] saveLLMSuggestion operation failed:", error.message);
  }
}
