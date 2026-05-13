CREATE TYPE "public"."annotation_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('progress', 'quality_alert', 'system', 'review_request');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."qa_status" AS ENUM('approved', 'rejected', 'needs_revision');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'manager', 'tasker', 'qa');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'submitted', 'approved', 'rejected', 'assigned', 'CREATED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'IN_QA', 'APPROVED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "annotations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taskId" integer NOT NULL,
	"userId" integer NOT NULL,
	"labelStudioAnnotationId" integer,
	"result" jsonb,
	"confidence" numeric(5, 2),
	"status" "annotation_status" DEFAULT 'pending_review' NOT NULL,
	"isDraft" boolean DEFAULT false,
	"aiSuggestion" jsonb,
	"timeSpentSeconds" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"isHoneyPotCheck" boolean DEFAULT false NOT NULL,
	"honeyPotPassed" boolean,
	"submittedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"task_count" integer DEFAULT 0 NOT NULL,
	"honey_pot_rate" numeric(4, 2) DEFAULT '0.05' NOT NULL,
	"qa_rate" numeric(4, 2) DEFAULT '0.20' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iaa_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"annotator1_id" integer,
	"annotator2_id" integer,
	"kappa_cohen" numeric(5, 4),
	"fleiss_kappa" numeric(5, 4),
	"agreement_pct" numeric(5, 2),
	"task_count" integer,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_suggestions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taskId" integer NOT NULL,
	"suggestion" jsonb,
	"confidence" numeric(5, 2),
	"accepted" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"projectId" integer,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"labelStudioProjectId" integer,
	"totalItems" integer DEFAULT 0 NOT NULL,
	"completedItems" integer DEFAULT 0 NOT NULL,
	"reviewedItems" integer DEFAULT 0 NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"labelingConfig" text,
	"annotationType" varchar(32) DEFAULT 'classification',
	"labelsConfig" jsonb,
	"instructions" text,
	"minAnnotations" integer DEFAULT 1,
	"aiPreAnnotation" boolean DEFAULT false,
	"qaAiEnabled" boolean DEFAULT false,
	"spamDetection" boolean DEFAULT false,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_reviews" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "qa_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"annotationId" integer NOT NULL,
	"reviewerId" integer NOT NULL,
	"status" "qa_status" NOT NULL,
	"feedback" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statistics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "statistics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"projectId" integer NOT NULL,
	"userId" integer,
	"totalAnnotations" integer DEFAULT 0 NOT NULL,
	"approvedAnnotations" integer DEFAULT 0 NOT NULL,
	"rejectedAnnotations" integer DEFAULT 0 NOT NULL,
	"averageQualityScore" numeric(5, 2) DEFAULT '0.00',
	"interAnnotatorAgreement" numeric(5, 2) DEFAULT '0.00',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_skips" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "task_skips_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taskId" integer NOT NULL,
	"userId" integer NOT NULL,
	"reason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_id" integer,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"projectId" integer NOT NULL,
	"labelStudioTaskId" integer,
	"content" text NOT NULL,
	"status" "task_status" DEFAULT 'CREATED' NOT NULL,
	"assignedTo" integer,
	"isGroundTruth" boolean DEFAULT false,
	"groundTruthResult" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"difficulty" integer DEFAULT 1,
	"isHoneyPot" boolean DEFAULT false NOT NULL,
	"honeyPotAnswer" jsonb,
	"batchId" integer,
	"expiresAt" timestamp,
	"mediaUrl" text,
	"requiredSkillLevel" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"passwordHash" text,
	"role" "role" DEFAULT 'user' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"labelStudioUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"skillLevel" integer DEFAULT 1 NOT NULL,
	"skillDomains" text[],
	"maxActiveTasks" integer DEFAULT 10 NOT NULL,
	"isAvailable" boolean DEFAULT true NOT NULL,
	"isSuspended" boolean DEFAULT false NOT NULL,
	"suspendedAt" timestamp,
	"suspendReason" text,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "worker_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"total_annotations" integer DEFAULT 0 NOT NULL,
	"qa_passed" integer DEFAULT 0 NOT NULL,
	"qa_failed" integer DEFAULT 0 NOT NULL,
	"honey_pot_total" integer DEFAULT 0 NOT NULL,
	"honey_pot_passed" integer DEFAULT 0 NOT NULL,
	"avg_time_seconds" numeric(10, 2) DEFAULT '0',
	"qa_pass_rate" numeric(5, 4) DEFAULT '0',
	"honey_pot_accuracy" numeric(5, 4) DEFAULT '0',
	"computed_at" timestamp DEFAULT now() NOT NULL
);
