import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@":        path.resolve(templateRoot, "client", "src"),
      "@shared":  path.resolve(templateRoot, "shared"),
      "@assets":  path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
    ],
    coverage: {
      provider:   "v8",
      reporter:   ["text", "json", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: [
        "server/workers/stateMachine.ts",
        "server/workers/honeypotChecker.ts",
        "server/workers/iaaWorker.ts",
        "server/workers/statsWorker.ts",
        "server/workers/distributionWorker.ts",
        "server/skipRateLimiter.ts",
      ],
      thresholds: {
        lines:      70,
        functions:  70,
        branches:   60,
        statements: 70,
      },
    },
    // Isolate each test file to prevent module mock leakage
    isolate: true,
    // Retry flaky tests once
    retry: 1,
    // Timeout per test
    testTimeout: 10_000,
  },
});
