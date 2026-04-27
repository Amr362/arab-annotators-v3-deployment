-- ============================================================
-- Migration: 0006_v4_state_machine.sql
-- Phase 1 of the AnnotateOS v4 redesign
-- Adds: new enums, columns, tables for the state machine,
--       worker metrics, honey pots, batches, IAA, and project assignments
-- Safe to run against a live v3 database (non-breaking additions only)
-- ============================================================

-- ── 1. Extend role enum with 'manager' ──────────────────────────────────────
ALTER TYPE role ADD VALUE IF NOT EXISTS 'manager';

-- ── 2. Extend task_status enum with v4 states ───────────────────────────────
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'IN_QA';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'EXPIRED';

-- ── 3. New columns on users ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "skillLevel"        INTEGER DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "skillDomains"      TEXT[],
  ADD COLUMN IF NOT EXISTS "maxActiveTasks"    INTEGER DEFAULT 10 NOT NULL,
  ADD COLUMN IF NOT EXISTS "isAvailable"       BOOLEAN DEFAULT TRUE NOT NULL,
  ADD COLUMN IF NOT EXISTS "isSuspended"       BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS "suspendedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "suspendReason"     TEXT;

-- Backfill existing users
UPDATE users
SET "skillLevel" = 1, "maxActiveTasks" = 10, "isAvailable" = TRUE
WHERE "skillLevel" IS NULL OR "skillLevel" = 0;

-- ── 4. New columns on tasks ──────────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS "difficulty"           INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "isHoneyPot"           BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS "honeyPotAnswer"       JSONB,
  ADD COLUMN IF NOT EXISTS "batchId"              INTEGER,
  ADD COLUMN IF NOT EXISTS "expiresAt"            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "mediaUrl"             TEXT,
  ADD COLUMN IF NOT EXISTS "requiredSkillLevel"   INTEGER DEFAULT 1 NOT NULL;

-- Backfill: map v3 status values → v4 canonical states
UPDATE tasks SET status = 'IN_PROGRESS' WHERE status = 'in_progress';
UPDATE tasks SET status = 'SUBMITTED'   WHERE status = 'submitted';
UPDATE tasks SET status = 'APPROVED'    WHERE status = 'approved';
UPDATE tasks SET status = 'REJECTED'    WHERE status = 'rejected';
-- Keep 'pending' as-is for now; CREATED is the new canonical form going forward

-- ── 5. New columns on annotations ───────────────────────────────────────────
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS "isHoneyPotCheck"  BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS "honeyPotPassed"   BOOLEAN,
  ADD COLUMN IF NOT EXISTS "submittedAt"      TIMESTAMPTZ;

-- ── 6. task_transitions — audit log for every state change ──────────────────
CREATE TABLE IF NOT EXISTS task_transitions (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  actor_id      INTEGER REFERENCES users(id),
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_transitions_task_id
  ON task_transitions (task_id);

-- ── 7. worker_metrics — per-user, per-project stats (recomputed by worker) ──
CREATE TABLE IF NOT EXISTS worker_metrics (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  total_annotations     INTEGER DEFAULT 0 NOT NULL,
  qa_passed             INTEGER DEFAULT 0 NOT NULL,
  qa_failed             INTEGER DEFAULT 0 NOT NULL,
  honey_pot_total       INTEGER DEFAULT 0 NOT NULL,
  honey_pot_passed      INTEGER DEFAULT 0 NOT NULL,
  avg_time_seconds      DECIMAL(10,2) DEFAULT 0,
  qa_pass_rate          DECIMAL(5,4) DEFAULT 0,
  honey_pot_accuracy    DECIMAL(5,4) DEFAULT 0,
  computed_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_metrics_user_project
  ON worker_metrics (user_id, project_id);

-- ── 8. batches — group tasks into controllable batches ──────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' NOT NULL,
  task_count      INTEGER DEFAULT 0 NOT NULL,
  honey_pot_rate  DECIMAL(4,2) DEFAULT 0.05 NOT NULL,
  qa_rate         DECIMAL(4,2) DEFAULT 0.20 NOT NULL,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 9. iaa_scores — inter-annotator agreement (computed by IAAWorker) ───────
CREATE TABLE IF NOT EXISTS iaa_scores (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  annotator1_id   INTEGER REFERENCES users(id),
  annotator2_id   INTEGER REFERENCES users(id),
  kappa_cohen     DECIMAL(5,4),
  fleiss_kappa    DECIMAL(5,4),
  agreement_pct   DECIMAL(5,2),
  task_count      INTEGER,
  computed_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 10. project_assignments — manager-driven team assignments ────────────────
CREATE TABLE IF NOT EXISTS project_assignments (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(project_id, user_id)
);

-- ── Done ──────────────────────────────────────────────────────────────────────
