import { integer, pgEnum, pgTable, text, timestamp, varchar, boolean, decimal, jsonb } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extended with Arab Annotators specific fields.
 */
export const roleEnum = pgEnum("role", ["user", "admin", "tasker", "qa"]);

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
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Projects table
export const projectStatusEnum = pgEnum("project_status", ["active", "paused", "completed"]);

export const projects = pgTable("projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  labelStudioProjectId: integer("labelStudioProjectId").notNull().unique(),
  totalItems: integer("totalItems").default(0).notNull(),
  completedItems: integer("completedItems").default(0).notNull(),
  reviewedItems: integer("reviewedItems").default(0).notNull(),
  status: projectStatusEnum("status").default("active").notNull(),
  labelingConfig: text("labelingConfig"),
  // Annotation config
  annotationType: varchar("annotationType", { length: 32 }).default("classification"),
  labelsConfig: jsonb("labelsConfig"),
  instructions: text("instructions"),
  minAnnotations: integer("minAnnotations").default(1),
  aiPreAnnotation: boolean("aiPreAnnotation").default(false),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// Tasks table
export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "submitted", "approved", "rejected"]);

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("projectId").notNull(),
  labelStudioTaskId: integer("labelStudioTaskId").notNull(),
  content: text("content").notNull(),
  status: taskStatusEnum("status").default("pending").notNull(),
  assignedTo: integer("assignedTo"),
  isGroundTruth: boolean("isGroundTruth").default(false),
  groundTruthResult: jsonb("groundTruthResult"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// Annotations table
export const annotationStatusEnum = pgEnum("annotation_status", ["pending_review", "approved", "rejected"]);

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
});

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = typeof annotations.$inferInsert;

// Task Skips table
export const taskSkips = pgTable("task_skips", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  userId: integer("userId").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskSkip = typeof taskSkips.$inferSelect;

// QA Reviews table
export const qaStatusEnum = pgEnum("qa_status", ["approved", "rejected", "needs_revision"]);

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

// Statistics table
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

// Notifications table
export const notificationTypeEnum = pgEnum("notification_type", ["progress", "quality_alert", "system", "review_request"]);

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

// LLM Suggestions table
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
