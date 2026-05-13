import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL, DATABASE_PRIVATE_URL, or DATABASE_DIRECT_URL must be set");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
