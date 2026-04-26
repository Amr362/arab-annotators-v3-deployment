-- PostgreSQL baseline migration: creates all tables if they don't already exist.
-- This replaces the MySQL-dialect migrations (0000, 0001) for fresh PostgreSQL deployments.

-- Enums (CREATE TYPE IF NOT EXISTS requires PG 9.6+; use DO block for safety)
DO $$ BEGIN
  CREATE TYPE "role" AS ENUM ('user', 'admin', 'tasker', 'qa');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "project_status" AS ENUM ('active', 'paused', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "task_status" AS ENUM ('pending', 'in_progress', 'submitted', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "annotation_status" AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "qa_status" AS ENUM ('approved', 'rejected', 'needs_revision');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "notification_type" AS ENUM ('progress', 'quality_alert', 'system', 'review_request');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "openId" varchar(64) NOT NULL UNIQUE,
  "name" text,
  "email" varchar(320),
  "loginMethod" varchar(64),
  "passwordHash" text,
  "role" "role" NOT NULL DEFAULT 'user',
  "isActive" boolean NOT NULL DEFAULT true,
  "labelStudioUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "lastSignedIn" timestamp NOT NULL DEFAULT now()
);

-- Projects table
CREATE TABLE IF NOT EXISTS "projects" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "name" text NOT NULL,
  "description" text,
  "labelStudioProjectId" integer,
  "totalItems" integer NOT NULL DEFAULT 0,
  "completedItems" integer NOT NULL DEFAULT 0,
  "reviewedItems" integer NOT NULL DEFAULT 0,
  "status" "project_status" NOT NULL DEFAULT 'active',
  "labelingConfig" text,
  "annotationType" varchar(32) DEFAULT 'classification',
  "labelsConfig" jsonb,
  "instructions" text,
  "minAnnotations" integer DEFAULT 1,
  "aiPreAnnotation" boolean DEFAULT false,
  "qaAiEnabled" boolean DEFAULT false,
  "spamDetection" boolean DEFAULT false,
  "createdBy" integer NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "projectId" integer NOT NULL,
  "labelStudioTaskId" integer,
  "content" text NOT NULL,
  "status" "task_status" NOT NULL DEFAULT 'pending',
  "assignedTo" integer,
  "isGroundTruth" boolean DEFAULT false,
  "groundTruthResult" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Annotations table
CREATE TABLE IF NOT EXISTS "annotations" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "taskId" integer NOT NULL,
  "userId" integer NOT NULL,
  "labelStudioAnnotationId" integer,
  "result" jsonb,
  "confidence" decimal(5, 2),
  "status" "annotation_status" NOT NULL DEFAULT 'pending_review',
  "isDraft" boolean DEFAULT false,
  "aiSuggestion" jsonb,
  "timeSpentSeconds" integer DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Task skips table
CREATE TABLE IF NOT EXISTS "task_skips" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "taskId" integer NOT NULL,
  "userId" integer NOT NULL,
  "reason" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- QA reviews table
CREATE TABLE IF NOT EXISTS "qa_reviews" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "annotationId" integer NOT NULL,
  "reviewerId" integer NOT NULL,
  "status" "qa_status" NOT NULL,
  "feedback" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Statistics table
CREATE TABLE IF NOT EXISTS "statistics" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "projectId" integer NOT NULL,
  "userId" integer,
  "totalAnnotations" integer NOT NULL DEFAULT 0,
  "approvedAnnotations" integer NOT NULL DEFAULT 0,
  "rejectedAnnotations" integer NOT NULL DEFAULT 0,
  "averageQualityScore" decimal(5, 2) DEFAULT '0.00',
  "interAnnotatorAgreement" decimal(5, 2) DEFAULT '0.00',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "userId" integer NOT NULL,
  "projectId" integer,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "type" "notification_type" NOT NULL,
  "isRead" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- LLM suggestions table
CREATE TABLE IF NOT EXISTS "llm_suggestions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "taskId" integer NOT NULL,
  "suggestion" jsonb,
  "confidence" decimal(5, 2),
  "accepted" boolean DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
