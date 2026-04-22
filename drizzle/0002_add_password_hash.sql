-- Add passwordHash column to users table for local authentication
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" text;
