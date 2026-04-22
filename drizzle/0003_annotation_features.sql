-- Add annotation config fields to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS "annotationType" varchar(32) DEFAULT 'classification',
  ADD COLUMN IF NOT EXISTS "labelsConfig" jsonb,
  ADD COLUMN IF NOT EXISTS "instructions" text,
  ADD COLUMN IF NOT EXISTS "minAnnotations" integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "aiPreAnnotation" boolean DEFAULT false;

-- Add ground truth + skip count to tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS "isGroundTruth" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "groundTruthResult" jsonb;

-- Add draft + ai suggestion + time spent to annotations
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS "isDraft" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "aiSuggestion" jsonb,
  ADD COLUMN IF NOT EXISTS "timeSpentSeconds" integer DEFAULT 0;

-- Task skips table
CREATE TABLE IF NOT EXISTS task_skips (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "taskId" integer NOT NULL,
  "userId" integer NOT NULL,
  reason text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
