import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || "";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
