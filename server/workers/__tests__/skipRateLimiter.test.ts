/**
 * SkipRateLimiter — unit tests
 * ─────────────────────────────
 * Pure in-process logic — no DB or network required.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { consumeSkip, getSkipStatus, _resetAll } from "../../skipRateLimiter";

beforeEach(() => _resetAll());
afterEach(() => { vi.useRealTimers(); _resetAll(); });

const USER  = 1;
const PROJ  = 100;
const LIMIT = 3; // matches SKIP_RATE_LIMIT in const.ts

describe("consumeSkip — basic quota", () => {
  it("allows first skip", () => {
    const r = consumeSkip(USER, PROJ);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(LIMIT - 1);
  });

  it(`allows up to ${LIMIT} skips`, () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(consumeSkip(USER, PROJ).allowed).toBe(true);
    }
  });

  it(`blocks the ${LIMIT + 1}th skip`, () => {
    for (let i = 0; i < LIMIT; i++) consumeSkip(USER, PROJ);
    const r = consumeSkip(USER, PROJ);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("provides retryAfterMs when blocked", () => {
    for (let i = 0; i < LIMIT; i++) consumeSkip(USER, PROJ);
    const r = consumeSkip(USER, PROJ);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});

describe("consumeSkip — isolation", () => {
  it("tracks separate buckets per project", () => {
    for (let i = 0; i < LIMIT; i++) consumeSkip(USER, PROJ);
    // Different project should still be allowed
    expect(consumeSkip(USER, 999).allowed).toBe(true);
  });

  it("tracks separate buckets per user", () => {
    for (let i = 0; i < LIMIT; i++) consumeSkip(USER, PROJ);
    // Different user should still be allowed
    expect(consumeSkip(99, PROJ).allowed).toBe(true);
  });
});

describe("consumeSkip — window reset", () => {
  it("resets after the 1-hour window expires", () => {
    vi.useFakeTimers();

    for (let i = 0; i < LIMIT; i++) consumeSkip(USER, PROJ);
    expect(consumeSkip(USER, PROJ).allowed).toBe(false);

    // Advance past 1-hour window
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    const r = consumeSkip(USER, PROJ);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(LIMIT - 1);
  });
});

describe("getSkipStatus", () => {
  it("returns full remaining when no skips used", () => {
    const s = getSkipStatus(USER, PROJ);
    expect(s.count).toBe(0);
    expect(s.remaining).toBe(LIMIT);
    expect(s.resetsIn).toBe(0);
  });

  it("reflects consumed skips correctly", () => {
    consumeSkip(USER, PROJ);
    consumeSkip(USER, PROJ);
    const s = getSkipStatus(USER, PROJ);
    expect(s.count).toBe(2);
    expect(s.remaining).toBe(LIMIT - 2);
    expect(s.resetsIn).toBeGreaterThan(0);
  });

  it("returns 0 remaining when exhausted", () => {
    for (let i = 0; i < LIMIT; i++) consumeSkip(USER, PROJ);
    const s = getSkipStatus(USER, PROJ);
    expect(s.remaining).toBe(0);
    expect(s.count).toBe(LIMIT);
  });

  it("does NOT consume quota (read-only)", () => {
    consumeSkip(USER, PROJ);
    getSkipStatus(USER, PROJ);
    getSkipStatus(USER, PROJ);
    // Still only 1 consumed
    expect(getSkipStatus(USER, PROJ).count).toBe(1);
  });
});
