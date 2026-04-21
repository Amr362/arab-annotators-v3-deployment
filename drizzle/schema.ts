import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with Arab Annotators specific fields.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "tasker", "qa"]).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  labelStudioUserId: int("labelStudioUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Projects table
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  labelStudioProjectId: int("labelStudioProjectId").notNull().unique(),
  totalItems: int("totalItems").default(0).notNull(),
  completedItems: int("completedItems").default(0).notNull(),
  reviewedItems: int("reviewedItems").default(0).notNull(),
  status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
  labelingConfig: text("labelingConfig"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// Tasks table
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  labelStudioTaskId: int("labelStudioTaskId").notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "submitted", "approved", "rejected"]).default("pending").notNull(),
  assignedTo: int("assignedTo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// Annotations table
export const annotations = mysqlTable("annotations", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  labelStudioAnnotationId: int("labelStudioAnnotationId"),
  result: json("result"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["pending_review", "approved", "rejected"]).default("pending_review").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = typeof annotations.$inferInsert;

// QA Reviews table
export const qaReviews = mysqlTable("qa_reviews", {
  id: int("id").autoincrement().primaryKey(),
  annotationId: int("annotationId").notNull(),
  reviewerId: int("reviewerId").notNull(),
  status: mysqlEnum("status", ["approved", "rejected", "needs_revision"]).notNull(),
  feedback: text("feedback"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QAReview = typeof qaReviews.$inferSelect;
export type InsertQAReview = typeof qaReviews.$inferInsert;

// Statistics table
export const statistics = mysqlTable("statistics", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId"),
  totalAnnotations: int("totalAnnotations").default(0).notNull(),
  approvedAnnotations: int("approvedAnnotations").default(0).notNull(),
  rejectedAnnotations: int("rejectedAnnotations").default(0).notNull(),
  averageQualityScore: decimal("averageQualityScore", { precision: 5, scale: 2 }).default("0.00"),
  interAnnotatorAgreement: decimal("interAnnotatorAgreement", { precision: 5, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Statistics = typeof statistics.$inferSelect;
export type InsertStatistics = typeof statistics.$inferInsert;

// Notifications table
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: mysqlEnum("type", ["progress", "quality_alert", "system", "review_request"]).notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// LLM Suggestions table
export const llmSuggestions = mysqlTable("llm_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  suggestion: json("suggestion"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  accepted: boolean("accepted").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LLMSuggestion = typeof llmSuggestions.$inferSelect;
export type InsertLLMSuggestion = typeof llmSuggestions.$inferInsert;