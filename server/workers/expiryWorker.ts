/**
 * ExpiryWorker — v4
 * ──────────────────
 * Runs every 60 seconds and expires tasks that were ASSIGNED or IN_PROGRESS
 * but not completed before their expiresAt timestamp.
 *
 * Expired tasks are reset to CREATED so they re-enter the distribution pool.
 */

import { expireOverdueTasks } from "./stateMachine";

const EXPIRY_INTERVAL_MS = 60_000;

let _expiryIntervalId: ReturnType<typeof setInterval> | null = null;

export function startExpiryWorker(): void {
  if (_expiryIntervalId) return;

  console.log("[ExpiryWorker] Starting — check every 60s");
  _expiryIntervalId = setInterval(async () => {
    try {
      const expired = await expireOverdueTasks();
      if (expired > 0) {
        console.log(`[ExpiryWorker] Expired ${expired} overdue tasks`);
      }
    } catch (e) {
      console.error("[ExpiryWorker] Error:", e);
    }
  }, EXPIRY_INTERVAL_MS);
}

export function stopExpiryWorker(): void {
  if (_expiryIntervalId) {
    clearInterval(_expiryIntervalId);
    _expiryIntervalId = null;
  }
}
