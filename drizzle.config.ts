import { defineConfig } from "drizzle-kit";

// Use Direct URL for migrations/push to avoid pooler issues in Railway/Supabase
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or DATABASE_DIRECT_URL must be set");
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  },
});
