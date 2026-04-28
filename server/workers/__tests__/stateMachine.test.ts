/**
 * TaskStateMachine — unit tests
 * ─────────────────────────────
 * Tests all valid and invalid transitions without hitting the database.
 * Uses vitest mocking to replace the db layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidTransition } from "../stateMachine";

// ─── isValidTransition (pure function — no DB needed) ────────────────────────

describe("isValidTransition — valid paths", () => {
  const validPairs: [string, string][] = [
    ["CREATED",     "ASSIGNED"],
    ["ASSIGNED",    "IN_PROGRESS"],
    ["ASSIGNED",    "EXPIRED"],
    ["IN_PROGRESS", "SUBMITTED"],
    ["IN_PROGRESS", "EXPIRED"],
    ["SUBMITTED",   "IN_QA"],
    ["IN_QA",       "APPROVED"],
    ["IN_QA",       "REJECTED"],
    ["REJECTED",    "ASSIGNED"],
    ["EXPIRED",     "CREATED"],
  ];

  validPairs.forEach(([from, to]) => {
    it(`${from} → ${to} is allowed`, () => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  });
});

describe("isValidTransition — invalid / forbidden paths", () => {
  const invalidPairs: [string, string][] = [
    ["APPROVED",    "ASSIGNED"],    // terminal state
    ["APPROVED",    "REJECTED"],    // terminal state
    ["CREATED",     "SUBMITTED"],   // skip ASSIGNED
    ["CREATED",     "APPROVED"],    // skip all steps
    ["IN_PROGRESS", "APPROVED"],    // skip SUBMITTED + IN_QA
    ["SUBMITTED",   "ASSIGNED"],    // skip QA
    ["IN_QA",       "IN_PROGRESS"], // backwards
    ["EXPIRED",     "APPROVED"],    // expired can only reset
  ];

  invalidPairs.forEach(([from, to]) => {
    it(`${from} → ${to} is forbidden`, () => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  });
});

describe("isValidTransition — v3 legacy aliases", () => {
  it("treats 'pending' as CREATED", () => {
    expect(isValidTransition("pending", "ASSIGNED")).toBe(true);
  });

  it("treats 'in_progress' as IN_PROGRESS", () => {
    expect(isValidTransition("in_progress", "SUBMITTED")).toBe(true);
  });

  it("treats 'submitted' as SUBMITTED", () => {
    expect(isValidTransition("submitted", "IN_QA")).toBe(true);
  });

  it("treats 'approved' as terminal", () => {
    expect(isValidTransition("approved", "ASSIGNED")).toBe(false);
  });

  it("handles mixed v3 → v4", () => {
    expect(isValidTransition("in_progress", "SUBMITTED")).toBe(true);
    expect(isValidTransition("IN_PROGRESS", "submitted")).toBe(true);
  });
});

// ─── transition() — with DB mock ─────────────────────────────────────────────

describe("transition() — DB integration (mocked)", () => {
  const mockUpdate  = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
  const mockInsert  = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
  const mockSelect  = vi.fn();
  const mockDb      = { select: mockSelect, update: mockUpdate, insert: mockInsert };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when task does not exist", async () => {
    // Mock empty select result
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    vi.doMock("../db", () => ({ getDb: async () => mockDb }));

    const { transition } = await import("../stateMachine");
    await expect(transition({ taskId: 999, to: "ASSIGNED" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws BAD_REQUEST on invalid transition", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1, status: "APPROVED" }]),
        }),
      }),
    });

    vi.doMock("../db", () => ({ getDb: async () => mockDb }));

    const { transition } = await import("../stateMachine");
    await expect(transition({ taskId: 1, to: "ASSIGNED" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
