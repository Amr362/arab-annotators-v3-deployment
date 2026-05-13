import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
