import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { InsertUser, users, projects, tasks, annotations, qaReviews, statistics, notifications, llmSuggestions } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
      });
      _db = drizzle(pool);
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

  await db.update(annotations).set({ status: "rejected", updatedAt: new Date() }).where(eq(annotations.id, annotationId));

  const ann = await db.select().from(annotations).where(eq(annotations.id, annotationId)).limit(1);
  if (ann.length > 0) {
    await db.update(tasks).set({ status: "rejected", updatedAt: new Date() }).where(eq(tasks.id, ann[0].taskId));
  }
}

// ─── Statistics: Kappa & IAA ─────────────────────────────────────────────────

export async function computeCohenKappa(projectId: number, user1Id: number, user2Id: number) {
  const db = await getDb();
  if (!db) return { kappa: 0, agreement: 0, taskCount: 0 };

  const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const taskIds = projectTasks.map(t => t.id);
  if (!taskIds.length) return { kappa: 0, agreement: 0, taskCount: 0 };

  const [ann1, ann2] = await Promise.all([
    db.select({ taskId: annotations.taskId, result: annotations.result }).from(annotations).where(and(inArray(annotations.taskId, taskIds), eq(annotations.userId, user1Id))),
    db.select({ taskId: annotations.taskId, result: annotations.result }).from(annotations).where(and(inArray(annotations.taskId, taskIds), eq(annotations.userId, user2Id))),
  ]);

  const map1 = Object.fromEntries(ann1.map(a => [a.taskId, a.result]));
  const map2 = Object.fromEntries(ann2.map(a => [a.taskId, a.result]));

  const commonTaskIds = taskIds.filter(id => map1[id] !== undefined && map2[id] !== undefined);
  if (!commonTaskIds.length) return { kappa: 0, agreement: 0, taskCount: 0 };

  function extractLabel(result: unknown): string {
    if (!result) return "";
    if (typeof result === "string") return result;
    const r = result as any;
    return String(r.label ?? r.choice ?? r.value ?? r.annotation ?? JSON.stringify(r));
  }

  let observedAgreement = 0;
  const labelCounts1: Record<string, number> = {};
  const labelCounts2: Record<string, number> = {};
  const n = commonTaskIds.length;

  for (const id of commonTaskIds) {
    const l1 = extractLabel(map1[id]);
    const l2 = extractLabel(map2[id]);
    if (l1 === l2) observedAgreement++;
    labelCounts1[l1] = (labelCounts1[l1] || 0) + 1;
    labelCounts2[l2] = (labelCounts2[l2] || 0) + 1;
  }

  observedAgreement /= n;

  let expectedAgreement = 0;
  const allLabels = [...new Set([...Object.keys(labelCounts1), ...Object.keys(labelCounts2)])];
  for (const l of allLabels) {
    const p1 = (labelCounts1[l] || 0) / n;
    const p2 = (labelCounts2[l] || 0) / n;
    expectedAgreement += p1 * p2;
  }

  const kappa = expectedAgreement === 1 ? 1 : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
  const kappaRounded = Math.round(kappa * 100) / 100;

  let interpretation = "";
  if (kappa < 0) interpretation = "اتفاق أقل من الصدفة";
  else if (kappa < 0.2) interpretation = "اتفاق ضعيف جداً";
  else if (kappa < 0.4) interpretation = "اتفاق ضعيف";
  else if (kappa < 0.6) interpretation = "اتفاق معتدل";
  else if (kappa < 0.8) interpretation = "اتفاق جيد";
  else interpretation = "اتفاق ممتاز";

  return {
    kappa: kappaRounded,
    agreement: Math.round(observedAgreement * 100),
    taskCount: n,
    interpretation,
  };
}

// Fleiss' Kappa for multiple annotators
export async function computeFleissKappa(projectId: number): Promise<{
  kappa: number;
  agreement: number;
  taskCount: number;
  annotatorCount: number;
  interpretation: string;
}> {
  const db = await getDb();
  if (!db) return { kappa: 0, agreement: 0, taskCount: 0, annotatorCount: 0, interpretation: "لا توجد بيانات" };

  const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const taskIds = projectTasks.map(t => t.id);
  if (!taskIds.length) return { kappa: 0, agreement: 0, taskCount: 0, annotatorCount: 0, interpretation: "لا توجد مهام" };

  const allAnnotations = await db
    .select({ taskId: annotations.taskId, userId: annotations.userId, result: annotations.result })
    .from(annotations)
    .where(inArray(annotations.taskId, taskIds));

  function extractLabel(result: unknown): string {
    if (!result) return "";
    if (typeof result === "string") return result;
    const r = result as any;
    return String(r.label ?? r.choice ?? r.value ?? r.annotation ?? JSON.stringify(r));
  }

  const taskMap: Record<number, string[]> = {};
  const annotators = new Set<number>();
  for (const ann of allAnnotations) {
    if (!taskMap[ann.taskId]) taskMap[ann.taskId] = [];
    taskMap[ann.taskId].push(extractLabel(ann.result));
    annotators.add(ann.userId);
  }

  const validTasks = Object.values(taskMap).filter(labels => labels.length >= 2);
  if (!validTasks.length) return { kappa: 0, agreement: 0, taskCount: 0, annotatorCount: annotators.size, interpretation: "لا توجد مهام مزدوجة" };

  // Collect all unique labels
  const allLabels = [...new Set(validTasks.flat())];
  const n = validTasks.length;
  const maxR = Math.max(...validTasks.map(l => l.length));

  // P_i: proportion of agreeing pairs per task
  let sumPi = 0;
  const labelFreq: Record<string, number> = {};

  for (const labels of validTasks) {
    const r = labels.length;
    const counts: Record<string, number> = {};
    for (const l of labels) {
      counts[l] = (counts[l] || 0) + 1;
      labelFreq[l] = (labelFreq[l] || 0) + 1;
    }
    let pi = 0;
    for (const c of Object.values(counts)) pi += c * (c - 1);
    sumPi += pi / (r * (r - 1));
  }

  const Pbar = sumPi / n;

  // P_j^2: expected agreement per label
  const totalLabels = Object.values(labelFreq).reduce((a, b) => a + b, 0);
  let PeBar = 0;
  for (const freq of Object.values(labelFreq)) {
    PeBar += Math.pow(freq / totalLabels, 2);
  }

  const kappa = PeBar === 1 ? 1 : (Pbar - PeBar) / (1 - PeBar);
  const kappaRounded = Math.round(kappa * 100) / 100;

  let interpretation = "";
  if (kappa < 0) interpretation = "اتفاق أقل من الصدفة";
  else if (kappa < 0.2) interpretation = "اتفاق ضعيف جداً";
  else if (kappa < 0.4) interpretation = "اتفاق ضعيف";
  else if (kappa < 0.6) interpretation = "اتفاق معتدل";
  else if (kappa < 0.8) interpretation = "اتفاق جيد";
  else interpretation = "اتفاق ممتاز";

  return {
    kappa: kappaRounded,
    agreement: Math.round(Pbar * 100),
    taskCount: n,
    annotatorCount: annotators.size,
    interpretation,
  };
}

// Get QA feedback for a specific tasker's annotations
export async function getTaskerFeedback(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const userAnnotations = await db
    .select({ id: annotations.id, taskId: annotations.taskId, result: annotations.result, status: annotations.status, createdAt: annotations.createdAt })
    .from(annotations)
    .where(eq(annotations.userId, userId));

  if (!userAnnotations.length) return [];

  const annIds = userAnnotations.map(a => a.id);
  const reviews = await db
    .select({
      id: qaReviews.id,
      annotationId: qaReviews.annotationId,
      status: qaReviews.status,
      feedback: qaReviews.feedback,
      createdAt: qaReviews.createdAt,
    })
    .from(qaReviews)
    .where(inArray(qaReviews.annotationId, annIds));

  // Join with annotation + task content
  const taskIds = [...new Set(userAnnotations.map(a => a.taskId))];
  const taskRows = taskIds.length > 0
    ? await db.select({ id: tasks.id, content: tasks.content }).from(tasks).where(inArray(tasks.id, taskIds))
    : [];
  const taskMap = Object.fromEntries(taskRows.map(t => [t.id, t.content]));
  const annMap = Object.fromEntries(userAnnotations.map(a => [a.id, a]));

  return reviews.map(r => ({
    ...r,
    taskContent: taskMap[annMap[r.annotationId]?.taskId ?? 0] ?? "",
    annotationResult: annMap[r.annotationId]?.result,
  }));
}

// ─── Local Auth helpers ───────────────────────────────────────────────────────
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  // Check if it's a bcrypt hash (usually starts with $2b$ or $2a$)
  if (stored.startsWith("$2")) {
    return await bcrypt.compare(supplied, stored);
  }
  
  // Fallback for old scrypt hashes (format: hash.salt)
  try {
    const [hashed, salt] = stored.split(".");
    if (hashed && salt) {
      const { scrypt, timingSafeEqual } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);
      const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
      const storedBuf = Buffer.from(hashed, "hex");
      return timingSafeEqual(buf, storedBuf);
    }
  } catch (e) {
    console.error("[Auth] Error verifying legacy password:", e);
  }
  
  return false;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Case-insensitive email lookup
  const normalised = email.trim().toLowerCase();
  const result = await db.select().from(users)
    .where(sql`LOWER(${users.email}) = ${normalised}`)
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setUserPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const hash = await hashPassword(password);
  await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, userId));
}

// ─── Admin: Leaderboard ───────────────────────────────────────────────────────
export async function getLeaderboard() {
  const db = await getDb();
  if (!db) return [];
  // Taskers ranked by approved annotations count
  const rows = await db
    .select({
      userId: annotations.userId,
      totalSubmitted: count(annotations.id),
    })
    .from(annotations)
    .groupBy(annotations.userId);

  if (!rows.length) return [];

  // Fetch user names
  const userIds = rows.map(r => r.userId);
  const userRows = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, userIds));
  const userMap = Object.fromEntries(userRows.map(u => [u.id, u]));

  // Get approved counts per user
  const approved = await db
    .select({ userId: annotations.userId, c: count(annotations.id) })
    .from(annotations)
    .where(eq(annotations.status, "approved"))
    .groupBy(annotations.userId);
  const approvedMap = Object.fromEntries(approved.map(r => [r.userId, Number(r.c)]));

  return rows
    .map(r => ({
      userId: r.userId,
      name: userMap[r.userId]?.name ?? `User ${r.userId}`,
      role: userMap[r.userId]?.role ?? "tasker",
      totalSubmitted: Number(r.totalSubmitted),
      approvedCount: approvedMap[r.userId] ?? 0,
      accuracy: Number(r.totalSubmitted) > 0 ? Math.round(((approvedMap[r.userId] ?? 0) / Number(r.totalSubmitted)) * 100) : 0,
    }))
    .sort((a, b) => b.approvedCount - a.approvedCount);
}

// ─── Admin: Rich statistics ───────────────────────────────────────────────────
export async function getAdminStats() {
  const db = await getDb();
  if (!db) return null;

  const [
    totalUsers, totalTaskers, totalQA,
    totalProjects, totalTasks,
    pendingAnnotations, approvedAnnotations, rejectedAnnotations,
    todayAnnotations,
  ] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(users).where(eq(users.role, "tasker")),
    db.select({ c: count() }).from(users).where(eq(users.role, "qa")),
    db.select({ c: count() }).from(projects),
    db.select({ c: count() }).from(tasks),
    db.select({ c: count() }).from(annotations).where(eq(annotations.status, "pending_review")),
    db.select({ c: count() }).from(annotations).where(eq(annotations.status, "approved")),
    db.select({ c: count() }).from(annotations).where(eq(annotations.status, "rejected")),
    db.select({ c: count() }).from(annotations).where(sql`DATE(${annotations.createdAt}) = CURRENT_DATE`),
  ]);

  // Daily annotations for last 7 days
  const last7 = await db.execute(sql`
    SELECT DATE(created_at) as day, COUNT(*) as total
    FROM annotations
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `);

    return {
    totalUsers: Number(totalUsers[0]?.c ?? 0),
    totalTaskers: Number(totalTaskers[0]?.c ?? 0),
    totalQA: Number(totalQA[0]?.c ?? 0),
    totalProjects: Number(totalProjects[0]?.c ?? 0),
    totalTasks: Number(totalTasks[0]?.c ?? 0),
    pendingAnnotations: Number(pendingAnnotations[0]?.c ?? 0),
    submittedAnnotations: Number(pendingAnnotations[0]?.c ?? 0), // Alias for frontend compatibility
    // Add a "totalSubmitted" that includes all non-draft annotations for better visibility
    totalSubmitted: Number(pendingAnnotations[0]?.c ?? 0) + Number(approvedAnnotations[0]?.c ?? 0) + Number(rejectedAnnotations[0]?.c ?? 0),
    approvedAnnotations: Number(approvedAnnotations[0]?.c ?? 0),
    rejectedAnnotations: Number(rejectedAnnotations[0]?.c ?? 0),
    todayAnnotations: Number(todayAnnotations[0]?.c ?? 0),
    dailyTrend: (last7.rows as any[]).map(r => ({
      day: String(r.day).slice(5), // MM-DD
      total: Number(r.total),
    })),
  };
}

// ─── Admin: Assign tasks to a tasker ─────────────────────────────────────────
export async function assignTasksToUser(taskIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const id of taskIds) {
    await db.update(tasks).set({ assignedTo: userId, status: "pending", updatedAt: new Date() }).where(eq(tasks.id, id));
  }
  return { assigned: taskIds.length };
}

// ─── Admin: Create project + bulk import tasks ────────────────────────────────
export async function createProjectWithTasks(opts: {
  name: string;
  description?: string;
  labelStudioProjectId?: number;
  createdBy: number;
  taskContents: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [inserted] = await db.insert(projects).values({
    name: opts.name,
    description: opts.description ?? null,
    labelStudioProjectId: opts.labelStudioProjectId ?? null,
    totalItems: opts.taskContents.length,
    createdBy: opts.createdBy,
  }).returning();

  const projectId = inserted.id;

  if (opts.taskContents.length > 0) {
    const taskRows = opts.taskContents.map((content, i) => ({
      projectId,
      labelStudioTaskId: null, // No longer strictly needed for internal projects
      content,
      status: "pending" as const,
    }));
    // Insert in batches of 100
    for (let i = 0; i < taskRows.length; i += 100) {
      await db.insert(tasks).values(taskRows.slice(i, i + 100));
    }
  }

  return await getProjectById(projectId);
}

// ─── Admin: Unassigned tasks for a project ───────────────────────────────────
export async function getUnassignedTasks(projectId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks)
    .where(and(eq(tasks.projectId, projectId), sql`${tasks.assignedTo} IS NULL`))
    .limit(limit);
}

// ─── Admin: Reset user password ───────────────────────────────────────────────
export async function resetUserPassword(userId: number, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const hash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: hash, loginMethod: "local", updatedAt: new Date() }).where(eq(users.id, userId));
  return { success: true };
}

// ─── Tasker: Log annotation time ─────────────────────────────────────────────
export async function logAnnotationTime(taskId: number, userId: number, seconds: number) {
  const db = await getDb();
  if (!db) return;
  // For now just return
}

// ─── Auth: find user by username OR email ────────────────────────────────────
export async function getUserByIdentifier(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Try email first, then name
  const byEmail = await db.select().from(users)
    .where(eq(users.email, identifier.toLowerCase())).limit(1);
  if (byEmail.length > 0) return byEmail[0];
  const byName = await db.select().from(users)
    .where(eq(users.name, identifier)).limit(1);
  return byName.length > 0 ? byName[0] : undefined;
}

// ─── Bootstrap: ensure admin exists on startup ───────────────────────────────
export async function bootstrapAdmin(opts: { name: string; email: string; password: string }) {
  const db = await getDb();
  if (!db) return;
  // Check if any admin already exists
  const existing = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (existing.length > 0) return; // Already have an admin

  const { randomUUID } = await import("crypto");
  const openId = `local_${randomUUID()}`;
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

// ─── Tasker: Submit annotation ───────────────────────────────────────────────
export async function submitTaskAnnotation(taskId: number, userId: number, result: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Check if there's an existing draft for this user and task
  const existingDraft = await db
    .select({ id: annotations.id })
    .from(annotations)
    .where(and(
      eq(annotations.taskId, taskId),
      eq(annotations.userId, userId),
      eq(annotations.isDraft, true)
    ))
    .limit(1);

  const timeSpentSeconds = result.timeSpentSeconds || 0;

  if (existingDraft.length > 0) {
    // Update existing draft to be a final submission
    await db.update(annotations)
      .set({
        result: result,
        isDraft: false,
        status: "pending_review",
        timeSpentSeconds: timeSpentSeconds,
        updatedAt: new Date()
      })
      .where(eq(annotations.id, existingDraft[0].id));
  } else {
    // Insert new final annotation
    await db.insert(annotations).values({
      taskId,
      userId,
      result,
      isDraft: false,
      status: "pending_review",
      timeSpentSeconds: timeSpentSeconds,
    });
  }

  // 2. Update task status to submitted
  await db.update(tasks)
    .set({
      status: "submitted",
      updatedAt: new Date()
    })
    .where(eq(tasks.id, taskId));

  // 3. Increment project completedItems counter
  const task = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (task.length > 0) {
    await db.execute(sql`
      UPDATE projects SET "completedItems" = "completedItems" + 1, "updatedAt" = NOW()
      WHERE id = ${task[0].projectId}
    `);
  }

  return { success: true };
}
