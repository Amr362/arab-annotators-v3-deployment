import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, projects, tasks, annotations, qaReviews, statistics, notifications, llmSuggestions } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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
  
  return {
    pendingCount,
    completedToday: 0, // TODO: Calculate from today's annotations
    accuracy: 0, // TODO: Calculate from QA reviews
    totalCompleted: completedCount,
    completedCount,
    totalCount: userTasks.length,
  };
}

// QA functions
export async function getQAQueue(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(qaReviews).where(eq(qaReviews.reviewerId, userId));
}

export async function getQAStats(userId: number) {
  const db = await getDb();
  if (!db) return { pendingReviews: 0, completedReviews: 0, agreementRate: 0 };
  
  const qaReviewsList = await db.select().from(qaReviews).where(eq(qaReviews.reviewerId, userId));
  const approvedCount = qaReviewsList.filter(r => r.status === 'approved').length;
  const rejectedCount = qaReviewsList.filter(r => r.status === 'rejected').length;
  
  return {
    pendingReviews: 0,
    completedReviews: approvedCount + rejectedCount,
    agreementRate: 0,
  };
}
