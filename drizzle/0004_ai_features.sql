-- Add AI feature flags to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS "qaAiEnabled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "spamDetection" boolean DEFAULT false;
