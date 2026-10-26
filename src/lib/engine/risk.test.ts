import { describe, expect, it } from "vitest";

import {
  analyze,
  applyScenarios,
  clampDropPct,
  computeLiquidationPriceUsd,
  cumulativePricePath,
  InvalidPositionError,
  stateAtPrice,
  validatePosition,
} from "./risk";
import { PRESET_SCENARIOS, TIMELINE_STAGES } from "./scenarios";

const position = {
  btcCollateral: 1,
  musdDebt: 10_000,
  btcPriceUsd: 20_000,
  liquidationThresholdPct: 110,
};

describe("validatePosition", () => {
  it("rejects non-positive numbers for each field", () => {
    expect(validatePosition({ ...position, btcCollateral: 0 })).toContain(
      "BTC collateral must be a positive number.",
    );
    expect(validatePosition({ ...position, musdDebt: 0 })).toContain(
      "MUSD debt must be a positive number.",
    );
    expect(validatePosition({ ...position, btcPriceUsd: -1 })).toContain(
      "BTC price must be a positive number.",
    );
  });

  it("rejects NaN and Infinity", () => {
    expect(validatePosition({ ...position, musdDebt: NaN }).length).toBeGreaterThan(0);
    expect(validatePosition({ ...position, btcPriceUsd: Infinity }).length).toBeGreaterThan(0);
  });

  it("accepts a healthy position", () => {
    expect(validatePosition(position)).toEqual([]);
  });
});

describe("computeLiquidationPriceUsd", () => {
  it("solves debt × threshold / (100 × btc)", () => {
    expect(computeLiquidationPriceUsd(1, 10_000, 110)).toBeCloseTo(11_000, 8);
    expect(computeLiquidationPriceUsd(0.2, 11_165, 110)).toBeCloseTo(61_407.5, 6);
  });

  it("is linear in debt and threshold, inverse in btc", () => {
    expect(computeLiquidationPriceUsd(1, 20_000, 110)).toBe(
      2 * computeLiquidationPriceUsd(1, 10_000, 110),
    );
    expect(computeLiquidationPriceUsd(2, 10_000, 110)).toBe(
      computeLiquidationPriceUsd(1, 10_000, 110) / 2,
    );
    expect(computeLiquidationPriceUsd(1, 10_000, 220)).toBe(
      2 * computeLiquidationPriceUsd(1, 10_000, 110),
    );
  });

  it("throws on non-positive threshold", () => {
    expect(() => computeLiquidationPriceUsd(1, 10_000, 0)).toThrow(InvalidPositionError);
  });
});

describe("stateAtPrice", () => {
  it("computes ratio and ltv as reciprocals at any price", () => {
    const s = stateAtPrice(1, 10_000, 15_000);
    expect(s.collateralValueUsd).toBeCloseTo(15_000, 8);
    expect(s.collateralRatio).toBeCloseTo(1.5, 8);
    expect(s.ltv).toBeCloseTo(10_000 / 15_000, 8);
  });

  it("tracks the ratio falling with price", () => {
    const before = stateAtPrice(1, 10_000, 12_000).collateralRatio;
    const after = stateAtPrice(1, 10_000, 9_000).collateralRatio;
    expect(after).toBeLessThan(before);
  });
});

describe("analyze", () => {
  it("computes metrics for a 200% collateral position", () => {
    // 1 BTC @ $20k, 10k debt → 200% CR; liquidation price = 11_000.
    const r = analyze(position);
    expect(r.collateralRatio).toBeCloseTo(2, 8);
    expect(r.liquidationPriceUsd).toBeCloseTo(11_000, 8);
    expect(r.dropToLiquidationPct).toBeCloseTo(45, 8);
  });

  it("reports zero headroom when already below threshold", () => {
    const r = analyze({ ...position, musdDebt: 20_000 }); // CR = 100% < 110%
    expect(r.collateralRatio).toBeCloseTo(1, 8);
    expect(r.dropToLiquidationPct).toBe(0);
  });

  it("collateral at liquidation equals threshold fraction of debt", () => {
    const r = analyze(position);
    // At liquidation, collateral value = 110% of debt.
    expect(r.collateralAtLiquidationUsd).toBeCloseTo(11_000, 8);
  });

  it("collateralDeficitToTargetUsd uses current collateral value", () => {
    const r = analyze(position);
    // Current collateral value 20_000; target 250% of 10_000 = 25_000.
    expect(r.collateralDeficitToTargetUsd(250)).toBeCloseTo(5_000, 8);
    expect(r.collateralDeficitToTargetUsd(150)).toBe(0);
  });

  it("throws on invalid inputs and invalid threshold", () => {
    expect(() => analyze({ ...position, musdDebt: 0 })).toThrow(InvalidPositionError);
    expect(() => analyze({ ...position, liquidationThresholdPct: -5 })).toThrow(
      InvalidPositionError,
    );
  });

  it("matches manual math on a realistic Mezo-sized position", () => {
    // 0.25 BTC @ $67k = $16,750 collateral; $11,165 debt → CR ≈ 1.5002.
    const r = analyze({
      btcCollateral: 0.25,
      musdDebt: 11_165,
      btcPriceUsd: 67_000,
      liquidationThresholdPct: 110,
    });
    expect(r.collateralRatio).toBeCloseTo(16_750 / 11_165, 8);
    // Liq price = 110% × 11_165 / (100 × 0.25) = 49_126.
    expect(r.liquidationPriceUsd).toBeCloseTo(49_126, 6);
  });
});

describe("applyScenarios — boundary conditions", () => {
  it("flags liquidation strictly below the threshold (docs: 'falls below')", () => {
    // 1 BTC @ 20k spot, threshold 110%.

    // price 11_000 → CR exactly 110% → NOT liquidated (boundary equality).
    const atBoundary = applyScenarios(position, [{ id: "b", label: "b", dropPct: 45 }])[0];
    expect(atBoundary.shockedPriceUsd).toBeCloseTo(11_000, 8);
    expect(atBoundary.collateralRatio).toBeCloseTo(1.1, 8);
    expect(atBoundary.liquidated).toBe(false);

    // One tick deeper → strictly below → liquidated.
    const below = applyScenarios(position, [{ id: "c", label: "c", dropPct: 45.0000001 }])[0];
    expect(below.liquidated).toBe(true);
  });

  it("scenario ratio equals manual numerator/denominator math", () => {
    const s = applyScenarios(position, [{ id: "s", label: "s", dropPct: 50 }])[0];
    expect(s.shockedPriceUsd).toBeCloseTo(10_000, 8);
    expect(s.collateralRatio).toBeCloseTo(10_000 / 10_000, 8);
    expect(s.ltv).toBeCloseTo(1, 8);
  });

  it("zero additional headroom under threshold, positive above", () => {
    const safe = applyScenarios(position, [{ id: "safe", label: "safe", dropPct: 10 }])[0];
    // Liq at 11_000; shocked at 18_000 → headroom = 1 − 11_000/18_000.
    expect(safe.headroomDropPct).toBeCloseTo((1 - 11_000 / 18_000) * 100, 6);
    const dead = applyScenarios(position, [{ id: "dead", label: "dead", dropPct: 90 }])[0];
    expect(dead.headroomDropPct).toBe(0);
  });

  it("clamps drop percentages into [0, 100]", () => {
    expect(clampDropPct(-5)).toBe(0);
    expect(clampDropPct(150)).toBe(100);
    expect(clampDropPct(NaN)).toBe(0);
  });

  it("shock of 100% floors price to 0 safely", () => {
    const s = applyScenarios(position, [{ id: "zero", label: "zero", dropPct: 100 }])[0];
    expect(s.shockedPriceUsd).toBe(0);
    expect(s.collateralRatio).toBeCloseTo(0, 8);
    expect(s.liquidated).toBe(true);
  });

  it("survives an empty scenario list", () => {
    expect(applyScenarios(position, [])).toEqual([]);
  });

  it("preset scenarios cover all severities and never crash", () => {
    for (const s of PRESET_SCENARIOS) {
      const out = applyScenarios(position, [s]);
      expect(out.length).toBe(1);
      expect(Number.isFinite(out[0].collateralRatio)).toBe(true);
    }
  });
});

describe("cumulativePricePath — timeline math", () => {
  it("compounds stage drops multiplicatively", () => {
    const path = cumulativePricePath(20_000, [15, 20, 30, 10]);
    expect(path[0]).toBeCloseTo(17_000, 8);
    expect(path[1]).toBeCloseTo(13_600, 8);
    expect(path[2]).toBeCloseTo(9_520, 8);
    expect(path[3]).toBeCloseTo(8_568, 8);
  });

  it("matches applyScenarios results when stages are applied sequentially", () => {
    const path = cumulativePricePath(20_000, TIMELINE_STAGES.map((s) => s.dropPct));
    for (const [i, price] of path.entries()) {
      // A cumulative drop of `1 − price / 20_000` reaches the same price
      // as the compounded stages up to and including stage i.
      const stage = applyScenarios(position, [
        {
          id: TIMELINE_STAGES[i].id,
          label: TIMELINE_STAGES[i].label,
          dropPct: (1 - price / 20_000) * 100,
        },
      ])[0];
      expect(stage.shockedPriceUsd).toBeCloseTo(price, 6);
    }
  });
});
