/**
 * Worker startup entry point — v4
 * ─────────────────────────────────
 * Import and start all background workers.
 * Called once at server startup from server/_core/index.ts
 *
 * Workers started:
 *   - StatsWorker     — recomputes worker metrics every 60s
 *   - IAAWorker       — recomputes IAA scores every 5 minutes
 *   - ExpiryWorker    — expires overdue tasks every 60s
 *
 * Note: BullMQ (Redis-backed) is the recommended upgrade for
 * production workloads. The current implementation uses setInterval
 * polling which is reliable for single-node deployments (Railway).
 * When Redis is available, replace with BullMQ Queue + Worker pattern.
 */

import { startStatsWorker, stopStatsWorker } from "./statsWorker";
import { startIAAWorker, stopIAAWorker } from "./iaaWorker";
import { startExpiryWorker, stopExpiryWorker } from "./expiryWorker";

let _started = false;

export function startAllWorkers(): void {
  if (_started) return;
  _started = true;

  console.log("[Workers] Starting all background workers...");
  startStatsWorker();
  startIAAWorker();
  startExpiryWorker();
  console.log("[Workers] All workers running.");
}

export function stopAllWorkers(): void {
  stopStatsWorker();
  stopIAAWorker();
  stopExpiryWorker();
  _started = false;
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Workers] SIGTERM received — stopping workers");
  stopAllWorkers();
});

process.on("SIGINT", () => {
  console.log("[Workers] SIGINT received — stopping workers");
  stopAllWorkers();
});
