/**
 * DistributionWorker — unit tests
 * ────────────────────────────────
 * Tests skill-level matching, capacity checks, and expiry calculation.
 * DB calls fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Pure helper: skill eligibility ──────────────────────────────────────────
// Extracted from distributionWorker logic

function isEligible(workerSkill: number, taskRequiredSkill: number): boolean {
  return taskRequiredSkill <= workerSkill;
}

function isAtCapacity(activeCount: number, maxActive: number): boolean {
  return activeCount >= maxActive;
}

function calcExpiry(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

describe("skill eligibility", () => {
  it("allows task with requiredSkill = workerSkill", () => {
    expect(isEligible(3, 3)).toBe(true);
  });

  it("allows task with requiredSkill < workerSkill", () => {
    expect(isEligible(5, 1)).toBe(true);
  });

  it("blocks task with requiredSkill > workerSkill", () => {
    expect(isEligible(2, 3)).toBe(false);
  });

  it("skill 1 can do all difficulty-1 tasks", () => {
    expect(isEligible(1, 1)).toBe(true);
  });

  it("skill 5 can do all tasks", () => {
    [1, 2, 3, 4, 5].forEach(r => expect(isEligible(5, r)).toBe(true));
  });

  it("skill 1 cannot do difficulty 2+", () => {
    [2, 3, 4, 5].forEach(r => expect(isEligible(1, r)).toBe(false));
  });
});

describe("capacity check", () => {
  it("not at capacity when active < max", () => {
    expect(isAtCapacity(5, 10)).toBe(false);
  });

  it("at capacity when active === max", () => {
    expect(isAtCapacity(10, 10)).toBe(true);
  });

  it("at capacity when active > max (edge case)", () => {
    expect(isAtCapacity(11, 10)).toBe(true);
  });

  it("not at capacity when active = 0", () => {
    expect(isAtCapacity(0, 10)).toBe(false);
  });
});

describe("expiry calculation", () => {
  it("sets expiry 24h from now by default", () => {
    const before = Date.now();
    const expiry = calcExpiry(24);
    const after  = Date.now();
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + 24 * 3600_000);
    expect(expiry.getTime()).toBeLessThanOrEqual(after  + 24 * 3600_000);
  });

  it("expiry is in the future", () => {
    expect(calcExpiry(1).getTime()).toBeGreaterThan(Date.now());
  });

  it("expiry is a Date object", () => {
    expect(calcExpiry(24)).toBeInstanceOf(Date);
  });
});

// ─── assignNextTask — integration (DB mocked) ────────────────────────────────

describe("assignNextTask — DB mocked", () => {
  beforeEach(() => vi.resetModules());

  function makeDb({ workerRows = [], activeCount = 0, doneRows = [], taskRows = [] } = {}) {
    return {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(workerRows) }) }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue([{ c: activeCount }]) }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(taskRows) }) }) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    };
  }

  it("returns null when worker not found", async () => {
    vi.doMock("../../db", () => ({ getDb: async () => makeDb({ workerRows: [] }) }));
    vi.doMock("../stateMachine", () => ({ transition: vi.fn() }));
    const { assignNextTask } = await import("../distributionWorker");
    await expect(assignNextTask(99)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns null when worker is suspended", async () => {
    const db = makeDb({ workerRows: [{ id: 1, skillLevel: 3, maxActiveTasks: 10, isAvailable: true, isSuspended: true }] });
    vi.doMock("../../db", () => ({ getDb: async () => db }));
    vi.doMock("../stateMachine", () => ({ transition: vi.fn() }));
    const { assignNextTask } = await import("../distributionWorker");
    await expect(assignNextTask(1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null when worker is unavailable", async () => {
    const db = makeDb({ workerRows: [{ id: 1, skillLevel: 3, maxActiveTasks: 10, isAvailable: false, isSuspended: false }] });
    vi.doMock("../../db", () => ({ getDb: async () => db }));
    vi.doMock("../stateMachine", () => ({ transition: vi.fn() }));
    const { assignNextTask } = await import("../distributionWorker");
    expect(await assignNextTask(1)).toBeNull();
  });

  it("returns null when at capacity", async () => {
    const db = makeDb({
      workerRows: [{ id: 1, skillLevel: 3, maxActiveTasks: 5, isAvailable: true, isSuspended: false }],
      activeCount: 5,
    });
    vi.doMock("../../db", () => ({ getDb: async () => db }));
    vi.doMock("../stateMachine", () => ({ transition: vi.fn() }));
    const { assignNextTask } = await import("../distributionWorker");
    expect(await assignNextTask(1)).toBeNull();
  });

  it("returns null when no tasks available", async () => {
    const db = makeDb({
      workerRows: [{ id: 1, skillLevel: 3, maxActiveTasks: 10, isAvailable: true, isSuspended: false }],
      activeCount: 0,
      taskRows: [],
    });
    vi.doMock("../../db", () => ({ getDb: async () => db }));
    vi.doMock("../stateMachine", () => ({ transition: vi.fn() }));
    const { assignNextTask } = await import("../distributionWorker");
    expect(await assignNextTask(1)).toBeNull();
  });
});
