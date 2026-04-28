/**
 * Honey Pot Checker — unit tests
 * ────────────────────────────────
 * Tests label extraction and comparison logic (pure functions).
 * DB-dependent checkHoneyPot() tested with full mocks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Inline pure helpers (mirrors honeypotChecker.ts internals) ──────────────

function extractLabel(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as any;
  if (Array.isArray(r.labels) && r.labels.length > 0) return r.labels[0].toLowerCase().trim();
  if (typeof r.choice === "string") return r.choice.toLowerCase().trim();
  if (typeof r.label  === "string") return r.label.toLowerCase().trim();
  return null;
}

function extractAllLabels(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as any;
  if (Array.isArray(r.labels)) return r.labels.map((l: string) => l.toLowerCase().trim());
  const single = extractLabel(result);
  return single ? [single] : [];
}

function labelsMatch(gt: unknown, worker: unknown): boolean {
  const gtLabel     = extractLabel(gt);
  const workerLabel = extractLabel(worker);
  if (gtLabel && workerLabel) return gtLabel === workerLabel;
  const gtAll     = extractAllLabels(gt);
  const workerAll = extractAllLabels(worker);
  if (!gtAll.length) return false;
  const overlap = gtAll.filter(l => workerAll.includes(l)).length / gtAll.length;
  return overlap >= 0.8;
}

// ─── extractLabel ─────────────────────────────────────────────────────────────

describe("extractLabel", () => {
  it("extracts from labels array", () => {
    expect(extractLabel({ labels: ["positive"] })).toBe("positive");
  });
  it("extracts from choice field", () => {
    expect(extractLabel({ choice: "Yes" })).toBe("yes");
  });
  it("extracts from label field", () => {
    expect(extractLabel({ label: "Cat" })).toBe("cat");
  });
  it("returns null for empty result", () => {
    expect(extractLabel(null)).toBeNull();
    expect(extractLabel({})).toBeNull();
    expect(extractLabel({ labels: [] })).toBeNull();
  });
  it("trims whitespace", () => {
    expect(extractLabel({ choice: "  yes  " })).toBe("yes");
  });
  it("normalises to lowercase", () => {
    expect(extractLabel({ labels: ["POSITIVE"] })).toBe("positive");
  });
});

// ─── extractAllLabels ─────────────────────────────────────────────────────────

describe("extractAllLabels", () => {
  it("returns all labels from array", () => {
    expect(extractAllLabels({ labels: ["a", "b", "C"] })).toEqual(["a", "b", "c"]);
  });
  it("wraps single label in array", () => {
    expect(extractAllLabels({ choice: "yes" })).toEqual(["yes"]);
  });
  it("returns [] for null", () => {
    expect(extractAllLabels(null)).toEqual([]);
  });
});

// ─── labelsMatch (single-label) ───────────────────────────────────────────────

describe("labelsMatch — single label", () => {
  it("returns true when labels match exactly", () => {
    expect(labelsMatch({ labels: ["positive"] }, { labels: ["positive"] })).toBe(true);
  });
  it("returns false when labels differ", () => {
    expect(labelsMatch({ labels: ["positive"] }, { labels: ["negative"] })).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(labelsMatch({ choice: "YES" }, { choice: "yes" })).toBe(true);
  });
  it("cross-field match (labels vs choice)", () => {
    expect(labelsMatch({ labels: ["yes"] }, { choice: "yes" })).toBe(true);
  });
});

// ─── labelsMatch (multi-label, 80% threshold) ────────────────────────────────

describe("labelsMatch — multi-label overlap", () => {
  it("passes when overlap ≥ 80%", () => {
    // 4 of 5 match = 80%
    expect(labelsMatch(
      { labels: ["a", "b", "c", "d", "e"] },
      { labels: ["a", "b", "c", "d", "x"] }
    )).toBe(true);
  });
  it("fails when overlap < 80%", () => {
    // 1 of 3 match = 33%
    expect(labelsMatch(
      { labels: ["a", "b", "c"] },
      { labels: ["a", "x", "y"] }
    )).toBe(false);
  });
  it("passes 100% overlap", () => {
    expect(labelsMatch(
      { labels: ["a", "b"] },
      { labels: ["a", "b"] }
    )).toBe(true);
  });
  it("returns false when ground truth is empty", () => {
    expect(labelsMatch({ labels: [] }, { labels: ["a"] })).toBe(false);
  });
});

// ─── checkHoneyPot() — full mock ─────────────────────────────────────────────

describe("checkHoneyPot — DB mocked", () => {
  beforeEach(() => { vi.resetModules(); });

  async function makeCheck(
    honeyPotAnswer: unknown,
    workerResult: unknown,
    isHoneyPot = true
  ) {
    const mockDb = {
      select: vi.fn()
        .mockReturnValueOnce({                        // task query
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { honeyPotAnswer, isHoneyPot },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({                        // annotation query
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { result: workerResult },
                ]),
              }),
            }),
          }),
        }),
    };

    vi.doMock("../../db", () => ({ getDb: async () => mockDb }));
    const { checkHoneyPot } = await import("../honeypotChecker");
    return checkHoneyPot(1);
  }

  it("returns true when worker matches ground truth", async () => {
    const result = await makeCheck({ labels: ["positive"] }, { labels: ["positive"] });
    expect(result).toBe(true);
  });

  it("returns false when worker answer is wrong", async () => {
    const result = await makeCheck({ labels: ["positive"] }, { labels: ["negative"] });
    expect(result).toBe(false);
  });

  it("returns false when task is not a honey pot", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ isHoneyPot: false, honeyPotAnswer: null }]),
          }),
        }),
      }),
    };
    vi.doMock("../../db", () => ({ getDb: async () => mockDb }));
    const { checkHoneyPot } = await import("../honeypotChecker");
    expect(await checkHoneyPot(1)).toBe(false);
  });

  it("returns false when no annotation found", async () => {
    const mockDb = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ honeyPotAnswer: { labels: ["yes"] }, isHoneyPot: true }]) }) }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }),
        }),
    };
    vi.doMock("../../db", () => ({ getDb: async () => mockDb }));
    const { checkHoneyPot } = await import("../honeypotChecker");
    expect(await checkHoneyPot(1)).toBe(false);
  });
});
