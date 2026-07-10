// ============================================================================
// test/scene-fit.test.mjs
// ----------------------------------------------------------------------------
// Unit tests for the pure computeFit() scene-fit calculator, run under the
// Node built-in test runner (`node --test`) — ZERO new dependencies, no build
// step, no Foundry globals. computeFit is Foundry-free by design (see KD5 in
// .conclave/spec.md), which is exactly what makes it unit-testable here.
//
// Covered:
//   - the five original aspect modes (contain/cover/width/height/native) +
//     the unknown-mode fallback
//   - the "physical" mini mode: the four canonical numbers, cm/inch agreement,
//     the R-halves-scale relationship, and viewport invariance
//   - the rounding-bypass guarantee (computeFit returns full precision; the
//     2-decimal snap lives in fitSceneToTable, not here)
//   - the fail-closed guards (D=0, G=0, R=0, unresolved resW=0, unknown unit)
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeFit, FitComputeError } from "../scripts/scene-fit.mjs";

/** Absolute tolerance for the physical-scale float comparisons. */
const TOL = 1e-4;

// A 40" 1920x1080 panel, 100px grid, 1-inch target, R=1. The base case every
// physical assertion below is derived from.
const BASE = {
  mode: "physical",
  grid: 100,
  targetPhysical: 1,
  targetUnit: "inch",
  diagonalIn: 40,
  resW: 1920,
  resH: 1080,
  resolution: 1,
};

test("aspect modes: contain/cover/width/height/native + unknown fallback", () => {
  // sceneW:1000 sceneH:500 vpW:800 vpH:600 → sx=0.8, sy=1.2.
  const rect = { sceneW: 1000, sceneH: 500, vpW: 800, vpH: 600 };
  assert.equal(computeFit({ ...rect, mode: "contain" }), 0.8); // min(sx,sy)
  assert.equal(computeFit({ ...rect, mode: "cover" }), 1.2); // max(sx,sy)
  assert.equal(computeFit({ ...rect, mode: "width" }), 0.8); // sx
  assert.equal(computeFit({ ...rect, mode: "height" }), 1.2); // sy
  assert.equal(computeFit({ ...rect, mode: "native" }), 1.0); // 1:1
  assert.equal(computeFit({ ...rect, mode: "bogus" }), 0.8); // → contain
});

test("physical: four canonical scales (tol 1e-4)", () => {
  // Case 1 — 40" 1080p, 1-inch target, R=1.
  assert.ok(Math.abs(computeFit(BASE) - 0.5507) < TOL);
  // Case 2 — 2.54 cm == 1 inch, so identical to case 1.
  assert.ok(
    Math.abs(computeFit({ ...BASE, targetPhysical: 2.54, targetUnit: "cm" }) - 0.5507) < TOL,
  );
  // Case 3 — R=2 halves the scale.
  assert.ok(Math.abs(computeFit({ ...BASE, resolution: 2 }) - 0.2754) < TOL);
  // Case 4 — 55" 4K, 25 mm (2.5 cm) target on a 140px grid.
  const case4 = computeFit({
    mode: "physical",
    grid: 140,
    targetPhysical: 2.5,
    targetUnit: "cm",
    diagonalIn: 55,
    resW: 3840,
    resH: 2160,
    resolution: 1,
  });
  assert.ok(Math.abs(case4 - 0.5632) < TOL, `case4 was ${case4}`);
});

test("physical: cm and inch expressing the same size agree exactly", () => {
  const inch = computeFit({ ...BASE, targetPhysical: 2, targetUnit: "inch" });
  const cm = computeFit({ ...BASE, targetPhysical: 2 * 2.54, targetUnit: "cm" });
  assert.ok(Math.abs(inch - cm) < TOL);
});

test("physical: doubling the renderer resolution halves the scale", () => {
  const r1 = computeFit({ ...BASE, resolution: 1 });
  const r2 = computeFit({ ...BASE, resolution: 2 });
  assert.ok(Math.abs(r1 / 2 - r2) < TOL);
});

test("physical: scale is invariant to scene rect and viewport", () => {
  const a = computeFit(BASE);
  const b = computeFit({ ...BASE, sceneW: 9999, sceneH: 12, vpW: 1, vpH: 88888 });
  // Physical mode ignores the viewport entirely, so identical to the bit.
  assert.equal(a, b);
});

test("physical: computeFit returns FULL precision (rounding bypass)", () => {
  // The 2-decimal snap happens in fitSceneToTable, not here. computeFit must
  // hand back the raw value so physical mode can use it un-rounded.
  const raw = computeFit(BASE); // ~0.5507268...
  assert.notEqual(raw, 0.55); // not pre-rounded to 2 decimals
  assert.ok(Math.abs(raw - 0.5507268231) < 1e-7);
});

test("physical: fail-closed guards throw a typed FitComputeError", () => {
  assert.throws(() => computeFit({ ...BASE, diagonalIn: 0 }), FitComputeError);
  assert.throws(() => computeFit({ ...BASE, grid: 0 }), FitComputeError);
  assert.throws(() => computeFit({ ...BASE, resolution: 0 }), FitComputeError);
  // The unresolved auto-detect sentinel must never yield a usable scale.
  assert.throws(() => computeFit({ ...BASE, resW: 0 }), FitComputeError);
  assert.throws(() => computeFit({ ...BASE, resH: 0 }), FitComputeError);
  // Unknown unit fails closed too.
  assert.throws(() => computeFit({ ...BASE, targetUnit: "furlong" }), FitComputeError);
  // Non-finite inputs (e.g. NaN from a bad parse) fail closed.
  assert.throws(() => computeFit({ ...BASE, diagonalIn: Number.NaN }), FitComputeError);
});
