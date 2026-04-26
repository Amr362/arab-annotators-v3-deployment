import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
  // Exclude system extension schemas from introspection to avoid conflicts
  // with extensions like pg_stat_statements that own views/functions.
  extensionsFilters: ["postgis"],
  schemaFilter: ["public"],
});
