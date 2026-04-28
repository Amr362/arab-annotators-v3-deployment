/**
 * StatsWorker — unit tests
 * ─────────────────────────
 * Tests skill promotion thresholds and suspension logic (pure).
 */

import { describe, it, expect } from "vitest";

// ─── Inline promotion logic ───────────────────────────────────────────────────

const SKILL_THRESHOLDS = [
  { level: 2, minAnnotations: 50,   minQaPassRate: 0.85, minHpAccuracy: 0.90 },
  { level: 3, minAnnotations: 200,  minQaPassRate: 0.90, minHpAccuracy: 0.95 },
  { level: 4, minAnnotations: 500,  minQaPassRate: 0.93, minHpAccuracy: 0.97 },
  { level: 5, minAnnotations: 1000, minQaPassRate: 0.95, minHpAccuracy: 0.99 },
];

const HP_SUSPEND_THRESHOLD = 0.50;
const HP_MIN_SAMPLES = 5;

function getPromotedLevel(
  currentLevel: number,
  total: number,
  qaRate: number,
  hpRate: number
): number {
  let level = currentLevel;
  for (const tier of SKILL_THRESHOLDS) {
    if (
      level < tier.level &&
      total >= tier.minAnnotations &&
      qaRate >= tier.minQaPassRate &&
      hpRate >= tier.minHpAccuracy
    ) {
      level = tier.level;
      break;
    }
  }
  return level;
}

function shouldSuspend(hpTotal: number, hpAccuracy: number): boolean {
  return hpTotal >= HP_MIN_SAMPLES && hpAccuracy < HP_SUSPEND_THRESHOLD;
}

// ─── Promotion tests ──────────────────────────────────────────────────────────

describe("skill auto-promotion", () => {
  it("promotes to level 2 when all requirements met", () => {
    expect(getPromotedLevel(1, 50, 0.90, 0.95)).toBe(2);
  });

  it("does NOT promote when annotations insufficient", () => {
    expect(getPromotedLevel(1, 49, 0.90, 0.95)).toBe(1);
  });

  it("does NOT promote when QA rate too low", () => {
    expect(getPromotedLevel(1, 100, 0.84, 0.95)).toBe(1);
  });

  it("does NOT promote when HP accuracy too low", () => {
    expect(getPromotedLevel(1, 100, 0.90, 0.89)).toBe(1);
  });

  it("promotes to level 3 from level 2", () => {
    expect(getPromotedLevel(2, 200, 0.92, 0.96)).toBe(3);
  });

  it("promotes to level 4 from level 3", () => {
    expect(getPromotedLevel(3, 500, 0.94, 0.98)).toBe(4);
  });

  it("promotes to level 5 from level 4", () => {
    expect(getPromotedLevel(4, 1000, 0.96, 0.99)).toBe(5);
  });

  it("stays at level 5 (max)", () => {
    expect(getPromotedLevel(5, 9999, 1.0, 1.0)).toBe(5);
  });

  it("does NOT skip levels (level 1 → only goes to 2)", () => {
    // Even if level 3 criteria met, should stop at first matching tier
    expect(getPromotedLevel(1, 500, 0.95, 0.99)).toBe(2);
  });

  it("promotes at exact threshold boundary", () => {
    expect(getPromotedLevel(1, 50, 0.85, 0.90)).toBe(2);
  });
});

// ─── Auto-suspension tests ────────────────────────────────────────────────────

describe("auto-suspension", () => {
  it("suspends when HP accuracy < 50% with ≥ 5 samples", () => {
    expect(shouldSuspend(5, 0.49)).toBe(true);
  });

  it("does NOT suspend when HP accuracy = 50%", () => {
    expect(shouldSuspend(5, 0.50)).toBe(false);
  });

  it("does NOT suspend when HP accuracy > 50%", () => {
    expect(shouldSuspend(10, 0.60)).toBe(false);
  });

  it("does NOT suspend when samples < 5 (even if accuracy is 0%)", () => {
    expect(shouldSuspend(4, 0.0)).toBe(false);
  });

  it("suspends exactly at 5 samples with 0% accuracy", () => {
    expect(shouldSuspend(5, 0.0)).toBe(true);
  });

  it("does NOT suspend with 0 samples", () => {
    expect(shouldSuspend(0, 0.0)).toBe(false);
  });
});

// ─── QA pass rate calculation ─────────────────────────────────────────────────

describe("qaPassRate calculation", () => {
  function calcRate(passed: number, failed: number) {
    const total = passed + failed;
    return total > 0 ? passed / total : 0;
  }

  it("returns 1.0 when all passed", () => {
    expect(calcRate(100, 0)).toBe(1.0);
  });

  it("returns 0.0 when all failed", () => {
    expect(calcRate(0, 50)).toBe(0.0);
  });

  it("returns 0.0 when no reviews", () => {
    expect(calcRate(0, 0)).toBe(0.0);
  });

  it("correctly calculates 80% pass rate", () => {
    expect(calcRate(80, 20)).toBeCloseTo(0.8);
  });

  it("correctly calculates 90% pass rate", () => {
    expect(calcRate(90, 10)).toBeCloseTo(0.9);
  });
});
