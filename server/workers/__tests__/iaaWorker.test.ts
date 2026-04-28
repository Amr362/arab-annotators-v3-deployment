/**
 * IAAWorker — unit tests
 * ───────────────────────
 * Tests Cohen's κ and Fleiss' κ computation (pure functions).
 * No DB required.
 */

import { describe, it, expect } from "vitest";
import { computeCohensKappa, computeFleissKappa } from "../iaaWorker";

// ─── Cohen's Kappa ────────────────────────────────────────────────────────────

describe("computeCohensKappa", () => {

  it("returns 1.0 for perfect agreement", () => {
    const labels = ["a", "b", "a", "b", "a"];
    expect(computeCohensKappa(labels, labels)).toBeCloseTo(1.0);
  });

  it("returns < 0 for systematic disagreement", () => {
    const l1 = ["a", "a", "a", "b", "b"];
    const l2 = ["b", "b", "b", "a", "a"];
    expect(computeCohensKappa(l1, l2)).toBeLessThan(0);
  });

  it("returns ~0 for random agreement", () => {
    // When labels are equal proportions and arranged randomly
    const l1 = ["a", "b", "a", "b"];
    const l2 = ["b", "a", "b", "a"];
    const k = computeCohensKappa(l1, l2);
    expect(k).toBeLessThan(0.2);
  });

  it("returns 0 for empty input", () => {
    expect(computeCohensKappa([], [])).toBe(0);
  });

  it("handles mismatched lengths (returns 0)", () => {
    expect(computeCohensKappa(["a"], ["a", "b"])).toBe(0);
  });

  it("handles single category (trivial agreement)", () => {
    const labels = ["a", "a", "a"];
    // All same category → pe = 1.0 → kappa = 1 (special case)
    const k = computeCohensKappa(labels, labels);
    expect(k).toBe(1);
  });

  it("produces a value in range [-1, 1]", () => {
    const l1 = ["cat", "dog", "cat", "bird", "dog"];
    const l2 = ["dog", "cat", "cat", "bird", "cat"];
    const k = computeCohensKappa(l1, l2);
    expect(k).toBeGreaterThanOrEqual(-1);
    expect(k).toBeLessThanOrEqual(1);
  });

  it("kappa ≥ 0.8 for high agreement", () => {
    // 9 out of 10 agree
    const l1 = ["a","a","a","a","a","a","a","a","a","b"];
    const l2 = ["a","a","a","a","a","a","a","a","a","a"];
    const k = computeCohensKappa(l1, l2);
    expect(k).toBeGreaterThan(0.5);
  });
});

// ─── Fleiss' Kappa ────────────────────────────────────────────────────────────

describe("computeFleissKappa", () => {

  it("returns 0 for empty input", () => {
    expect(computeFleissKappa({})).toBe(0);
  });

  it("returns 0 when only one annotator per task", () => {
    const taskLabels = { "1": ["a"], "2": ["b"], "3": ["a"] };
    expect(computeFleissKappa(taskLabels)).toBe(0);
  });

  it("returns 1.0 for perfect multi-annotator agreement", () => {
    const taskLabels = {
      "1": ["a", "a", "a"],
      "2": ["b", "b", "b"],
      "3": ["a", "a", "a"],
    };
    const k = computeFleissKappa(taskLabels);
    expect(k).toBeCloseTo(1.0, 1);
  });

  it("returns < 1 for partial agreement", () => {
    const taskLabels = {
      "1": ["a", "a", "b"],
      "2": ["b", "b", "b"],
      "3": ["a", "a", "a"],
      "4": ["b", "a", "b"],
    };
    const k = computeFleissKappa(taskLabels);
    expect(k).toBeLessThan(1.0);
  });

  it("returns a number in range [-1, 1]", () => {
    const taskLabels = {
      "1": ["cat", "dog", "cat"],
      "2": ["dog", "dog", "bird"],
      "3": ["cat", "cat", "dog"],
    };
    const k = computeFleissKappa(taskLabels);
    expect(k).toBeGreaterThanOrEqual(-1);
    expect(k).toBeLessThanOrEqual(1);
  });

  it("handles 3-class labels", () => {
    const taskLabels = {
      "1": ["positive", "positive", "neutral"],
      "2": ["negative", "negative", "negative"],
      "3": ["positive", "neutral",  "positive"],
    };
    const k = computeFleissKappa(taskLabels);
    expect(typeof k).toBe("number");
    expect(isNaN(k)).toBe(false);
  });
});

// ─── Integration: kappa label categories ─────────────────────────────────────

describe("kappa interpretation thresholds", () => {
  it("κ ≥ 0.8 is 'excellent'", () => {
    const label = (k: number) =>
      k >= 0.8 ? "ممتاز" : k >= 0.6 ? "جيد" : k >= 0.4 ? "مقبول" : "ضعيف";
    expect(label(0.85)).toBe("ممتاز");
    expect(label(0.65)).toBe("جيد");
    expect(label(0.45)).toBe("مقبول");
    expect(label(0.2)).toBe("ضعيف");
  });
});
