import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * v4: Added 'manager' role between admin and tasker/qa
 */
export const roleEnum = pgEnum("role", ["user", "admin", "manager", "tasker", "qa"]);

export const projectStatusEnum = pgEnum("project_status", ["active", "paused", "completed"]);

/**
 * v4 canonical task states (v3 states kept for migration compatibility):
 *   CREATED → ASSIGNED → IN_PROGRESS → SUBMITTED → IN_QA → APPROVED | REJECTED
 *   REJECTED loops back to ASSIGNED
 *   EXPIRED can happen from ASSIGNED or IN_PROGRESS
 */
export const taskStatusEnum = pgEnum("task_status", [
  // v3 legacy (kept during migration backfill window)
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  // v4 canonical
  "CREATED",
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "IN_QA",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);

export const annotationStatusEnum = pgEnum("annotation_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const qaStatusEnum = pgEnum("qa_status", ["approved", "rejected", "needs_revision"]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "progress",
  "quality_alert",
  "system",
  "review_request",
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: text("passwordHash"),
  role: roleEnum("role").default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  labelStudioUserId: integer("labelStudioUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),

  // ── v4 additions ──────────────────────────────────────────────────────────
  skillLevel: integer("skillLevel").default(1).notNull(),
  skillDomains: text("skillDomains").array(),
  maxActiveTasks: integer("maxActiveTasks").default(10).notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  isSuspended: boolean("isSuspended").default(false).notNull(),
  suspendedAt: timestamp("suspendedAt"),
  suspendReason: text("suspendReason"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  labelStudioProjectId: integer("labelStudioProjectId"),
  totalItems: integer("totalItems").default(0).notNull(),
  completedItems: integer("completedItems").default(0).notNull(),
  reviewedItems: integer("reviewedItems").default(0).notNull(),
  status: projectStatusEnum("status").default("active").notNull(),
  labelingConfig: text("labelingConfig"),
  annotationType: varchar("annotationType", { length: 32 }).default("classification"),
  labelsConfig: jsonb("labelsConfig"),
  instructions: text("instructions"),
  minAnnotations: integer("minAnnotations").default(1),
  aiPreAnnotation: boolean("aiPreAnnotation").default(false),
  qaAiEnabled: boolean("qaAiEnabled").default(false),
  spamDetection: boolean("spamDetection").default(false),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("projectId").notNull(),
  labelStudioTaskId: integer("labelStudioTaskId"),
  content: text("content").notNull(),
  status: taskStatusEnum("status").default("CREATED").notNull(),
  assignedTo: integer("assignedTo"),
  isGroundTruth: boolean("isGroundTruth").default(false),
  groundTruthResult: jsonb("groundTruthResult"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),

  // ── v4 additions ──────────────────────────────────────────────────────────
  difficulty: integer("difficulty").default(1),
  isHoneyPot: boolean("isHoneyPot").default(false).notNull(),
  honeyPotAnswer: jsonb("honeyPotAnswer"),
  batchId: integer("batchId"),
  expiresAt: timestamp("expiresAt"),
  mediaUrl: text("mediaUrl"),
  requiredSkillLevel: integer("requiredSkillLevel").default(1).notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Annotations ──────────────────────────────────────────────────────────────

export const annotations = pgTable("annotations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  userId: integer("userId").notNull(),
  labelStudioAnnotationId: integer("labelStudioAnnotationId"),
  result: jsonb("result"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  status: annotationStatusEnum("status").default("pending_review").notNull(),
  isDraft: boolean("isDraft").default(false),
  aiSuggestion: jsonb("aiSuggestion"),
  timeSpentSeconds: integer("timeSpentSeconds").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),

  // ── v4 additions ──────────────────────────────────────────────────────────
  isHoneyPotCheck: boolean("isHoneyPotCheck").default(false).notNull(),
  honeyPotPassed: boolean("honeyPotPassed"),
  submittedAt: timestamp("submittedAt"),
});

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = typeof annotations.$inferInsert;

// ─── Task Skips ───────────────────────────────────────────────────────────────

export const taskSkips = pgTable("task_skips", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  userId: integer("userId").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskSkip = typeof taskSkips.$inferSelect;

// ─── QA Reviews ───────────────────────────────────────────────────────────────

export const qaReviews = pgTable("qa_reviews", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  annotationId: integer("annotationId").notNull(),
  reviewerId: integer("reviewerId").notNull(),
  status: qaStatusEnum("status").notNull(),
  feedback: text("feedback"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type QAReview = typeof qaReviews.$inferSelect;
export type InsertQAReview = typeof qaReviews.$inferInsert;

// ─── Statistics (legacy) ──────────────────────────────────────────────────────

export const statistics = pgTable("statistics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("projectId").notNull(),
  userId: integer("userId"),
  totalAnnotations: integer("totalAnnotations").default(0).notNull(),
  approvedAnnotations: integer("approvedAnnotations").default(0).notNull(),
  rejectedAnnotations: integer("rejectedAnnotations").default(0).notNull(),
  averageQualityScore: decimal("averageQualityScore", { precision: 5, scale: 2 }).default("0.00"),
  interAnnotatorAgreement: decimal("interAnnotatorAgreement", { precision: 5, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Statistics = typeof statistics.$inferSelect;
export type InsertStatistics = typeof statistics.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull(),
  projectId: integer("projectId"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: notificationTypeEnum("type").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── LLM Suggestions ──────────────────────────────────────────────────────────

export const llmSuggestions = pgTable("llm_suggestions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  suggestion: jsonb("suggestion"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  accepted: boolean("accepted").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LLMSuggestion = typeof llmSuggestions.$inferSelect;
export type InsertLLMSuggestion = typeof llmSuggestions.$inferInsert;

// ─── v4: Task Transitions ─────────────────────────────────────────────────────

export const taskTransitions = pgTable("task_transitions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  actorId: integer("actor_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TaskTransition = typeof taskTransitions.$inferSelect;
export type InsertTaskTransition = typeof taskTransitions.$inferInsert;

// ─── v4: Worker Metrics ───────────────────────────────────────────────────────

export const workerMetrics = pgTable("worker_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  projectId: integer("project_id").notNull(),
  totalAnnotations: integer("total_annotations").default(0).notNull(),
  qaPassed: integer("qa_passed").default(0).notNull(),
  qaFailed: integer("qa_failed").default(0).notNull(),
  honeyPotTotal: integer("honey_pot_total").default(0).notNull(),
  honeyPotPassed: integer("honey_pot_passed").default(0).notNull(),
  avgTimeSeconds: decimal("avg_time_seconds", { precision: 10, scale: 2 }).default("0"),
  qaPassRate: decimal("qa_pass_rate", { precision: 5, scale: 4 }).default("0"),
  honeyPotAccuracy: decimal("honey_pot_accuracy", { precision: 5, scale: 4 }).default("0"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
});

export type WorkerMetric = typeof workerMetrics.$inferSelect;
export type InsertWorkerMetric = typeof workerMetrics.$inferInsert;

// ─── v4: Batches ──────────────────────────────────────────────────────────────

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  status: text("status").default("pending").notNull(),
  taskCount: integer("task_count").default(0).notNull(),
  honeyPotRate: decimal("honey_pot_rate", { precision: 4, scale: 2 }).default("0.05").notNull(),
  qaRate: decimal("qa_rate", { precision: 4, scale: 2 }).default("0.20").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Batch = typeof batches.$inferSelect;
export type InsertBatch = typeof batches.$inferInsert;

// ─── v4: IAA Scores ───────────────────────────────────────────────────────────

export const iaaScores = pgTable("iaa_scores", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  annotator1Id: integer("annotator1_id"),
  annotator2Id: integer("annotator2_id"),
  kappaCohens: decimal("kappa_cohen", { precision: 5, scale: 4 }),
  fleissKappa: decimal("fleiss_kappa", { precision: 5, scale: 4 }),
  agreementPct: decimal("agreement_pct", { precision: 5, scale: 2 }),
  taskCount: integer("task_count"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
});

export type IAAScore = typeof iaaScores.$inferSelect;
export type InsertIAAScore = typeof iaaScores.$inferInsert;

// ─── v4: Project Assignments ──────────────────────────────────────────────────

export const projectAssignments = pgTable("project_assignments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
});

export type ProjectAssignment = typeof projectAssignments.$inferSelect;
export type InsertProjectAssignment = typeof projectAssignments.$inferInsert;
