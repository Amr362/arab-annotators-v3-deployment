-- Manual migration to remove unique constraint on labelStudioProjectId
-- This is for PostgreSQL (Railway)

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_labelStudioProjectId_unique";
ALTER TABLE "projects" ALTER COLUMN "labelStudioProjectId" DROP NOT NULL;
