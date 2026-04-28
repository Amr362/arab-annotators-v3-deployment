/**
 * Skip Rate Limiter — v4
 * ───────────────────────
 * Prevents annotation workers from skipping too many tasks in a short window.
 * Uses an in-process Map for single-node deployments (Railway).
 *
 * Limit: SKIP_RATE_LIMIT skips per worker per project per hour.
 * Upgrade path: replace Map with Redis INCR + EXPIRE for multi-node.
 */

import { SKIP_RATE_LIMIT, SKIP_WINDOW_MS } from "../shared/const";

interface SkipBucket {
  count: number;
  windowStart: number;
}

const _buckets = new Map<string, SkipBucket>();

function bucketKey(userId: number, projectId: number) {
  return `${userId}:${projectId}`;
}

/**
 * Attempt to consume one skip quota for a worker on a project.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }
 */
export function consumeSkip(
  userId: number,
  projectId: number
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const key = bucketKey(userId, projectId);
  const now = Date.now();

  let bucket = _buckets.get(key);

  // Reset if window has expired
  if (!bucket || now - bucket.windowStart > SKIP_WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
  }

  if (bucket.count >= SKIP_RATE_LIMIT) {
    const retryAfterMs = SKIP_WINDOW_MS - (now - bucket.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  bucket.count += 1;
  _buckets.set(key, bucket);

  return { allowed: true, remaining: SKIP_RATE_LIMIT - bucket.count };
}

/**
 * Get current skip usage without consuming quota (for UI display).
 */
export function getSkipStatus(
  userId: number,
  projectId: number
): { count: number; remaining: number; resetsIn: number } {
  const key = bucketKey(userId, projectId);
  const now = Date.now();
  const bucket = _buckets.get(key);

  if (!bucket || now - bucket.windowStart > SKIP_WINDOW_MS) {
    return { count: 0, remaining: SKIP_RATE_LIMIT, resetsIn: 0 };
  }

  return {
    count: bucket.count,
    remaining: SKIP_RATE_LIMIT - bucket.count,
    resetsIn: SKIP_WINDOW_MS - (now - bucket.windowStart),
  };
}

/** Clear all buckets — used in tests */
export function _resetAll() {
  _buckets.clear();
}
