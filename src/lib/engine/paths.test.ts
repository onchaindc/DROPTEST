import { describe, expect, it } from "vitest";

import {
  PATH_PRESETS,
  analyzePricePath,
  summarizePricePath,
} from "./paths";
import {
  cumulativePricePath,
  InvalidPositionError,
  reverseStress,
  type RiskModelInput,
} from "./risk";

const position: RiskModelInput = {
  btcCollateral: 1,
  musdDebt: 10_000,
  btcPriceUsd: 20_000,
  liquidationThresholdPct: 110,
};

describe("analyzePricePath (scenario comparison)", () => {
  it("compounds steps like cumulativePricePath", () => {
    const path = {
      id: "t",
      name: "Test",
      stepLabel: "Week",
      dropPcts: [10, 20, 5],
    };
    const prices = cumulativePricePath(20_000, [10, 20, 5]);
    const points = analyzePricePath(position, path);
    expect(points.map((p) => p.priceUsd)).toEqual(prices);
    expect(points.map((p) => p.step)).toEqual([1, 2, 3]);
    expect(points.map((p) => p.label)).toEqual([
      "Week 1",
      "Week 2",
      "Week 3",
    ]);
  });

  it("reports the true compounded cumulative drop, not the sum of stages", () => {
    // Two 50% stages compound to a 75% cumulative drop.
    const points = analyzePricePath(position, {
      id: "h",
      name: "Half twice",
      stepLabel: "Month",
      dropPcts: [50, 50],
    });
    expect(points[0].cumulativeDropPct).toBeCloseTo(50, 8);
    expect(points[1].cumulativeDropPct).toBeCloseTo(75, 8);
  });

  it("marks a breach strictly below the threshold at the crossing step", () => {
    // 1 BTC, 10k debt, 20k spot, 110% threshold: liq price is 11_000.
    const path = { id: "b", name: "B", stepLabel: "Day", dropPcts: [20, 30] };
    const points = analyzePricePath(position, path);
    expect(points[0].liquidated).toBe(false); // price 16_000, CR 160%
    expect(points[1].priceUsd).toBeCloseTo(11_200, 8);
    expect(points[1].collateralRatio).toBeCloseTo(1.12, 8);
    expect(points[1].liquidated).toBe(false); // above, not below
    const deeper = analyzePricePath(position, {
      id: "c",
      name: "C",
      stepLabel: "Day",
      dropPcts: [20, 32],
    });
    expect(deeper[1].priceUsd).toBeCloseTo(10_880, 8);
    expect(deeper[1].liquidated).toBe(true);
  });
});

describe("summarizePricePath", () => {
  it("reports lowest ratio, first breach, and ending collateral value", () => {
    // Path: 20k -> 16k -> 9k (CR 90%, breach) -> 8.55k.
    const summary = summarizePricePath(position, {
      id: "s",
      name: "S",
      stepLabel: "Week",
      dropPcts: [20, 43.75, 5],
    });
    expect(summary.lowestRatio).toBeCloseTo(0.855, 8);
    expect(summary.firstBreach?.step).toBe(2);
    expect(summary.firstBreach?.cumulativeDropPct).toBeCloseTo(55, 8);
    expect(summary.endingPriceUsd).toBeCloseTo(8_550, 8);
    expect(summary.endingCollateralRatio).toBeCloseTo(0.855, 8);
    expect(summary.endingCollateralValueUsd).toBeCloseTo(8_550, 8);
    // 8_550 is a 57.25% drop from the 20_000 starting price.
    expect(summary.maxCumulativeDropPct).toBeCloseTo(57.25, 8);
  });

  it("reports no breach for a safe path", () => {
    const summary = summarizePricePath(position, PATH_PRESETS[0]);
    expect(summary.firstBreach).toBeNull();
    // Gradual decline: 20k x 0.96^8 ≈ 14_428, CR ≈ 144%.
    expect(summary.lowestRatio).toBeGreaterThan(1.1);
  });

  it("survives an empty path by falling back to spot state", () => {
    const summary = summarizePricePath(position, {
      id: "e",
      name: "E",
      stepLabel: "Day",
      dropPcts: [],
    });
    expect(summary.lowestRatio).toBeCloseTo(2, 8);
    expect(summary.endingCollateralValueUsd).toBeCloseTo(20_000, 8);
    expect(summary.firstBreach).toBeNull();
    expect(summary.maxCumulativeDropPct).toBe(0);
  });

  it("never crashes on any preset with an arbitrary position", () => {
    for (const preset of PATH_PRESETS) {
      const summary = summarizePricePath(
        { ...position, btcPriceUsd: 91_234, musdDebt: 33_333 },
        preset,
      );
      expect(Number.isFinite(summary.lowestRatio)).toBe(true);
      expect(Number.isFinite(summary.endingCollateralValueUsd)).toBe(true);
    }
  });
});

describe("reverseStress", () => {
  it("solves price = targetRatio × debt / (100 × btc)", () => {
    const r = reverseStress(position, 150);
    // 1 BTC, 10k debt: price where CR = 150% is 15_000.
    expect(r.priceUsd).toBeCloseTo(15_000, 8);
    expect(r.dropFromSpotPct).toBeCloseTo(25, 8);
    expect(r.alreadyBreached).toBe(false);
  });

  it("matches the liquidation price when target equals the threshold", () => {
    expect(reverseStress(position, 110).priceUsd).toBeCloseTo(11_000, 8);
  });

  it("reports 0 drop and alreadyBreached when spot is past the target", () => {
    // Ratio at 20k spot is 200%; a 250% target needs a HIGHER price.
    const r = reverseStress(position, 250);
    expect(r.alreadyBreached).toBe(true);
    expect(r.dropFromSpotPct).toBe(0);
    expect(r.priceUsd).toBeCloseTo(25_000, 8);
  });

  it("rejects zero, negative, and non-numeric targets", () => {
    expect(() => reverseStress(position, 0)).toThrow(InvalidPositionError);
    expect(() => reverseStress(position, -10)).toThrow(InvalidPositionError);
    expect(() => reverseStress(position, NaN)).toThrow(InvalidPositionError);
    expect(() => reverseStress(position, Infinity)).toThrow(
      InvalidPositionError,
    );
  });

  it("rejects invalid underlying positions", () => {
    expect(() =>
      reverseStress({ ...position, btcCollateral: 0, musdDebt: 11_000 }, 150),
    ).toThrow(InvalidPositionError);
  });

  it("handles a 300% target on a leveraged position", () => {
    // CR at spot 100%: target 300% needs 30_000 collateral, which is a
    // 60_000 price at 0.5 BTC.
    const leveraged = {
      btcCollateral: 0.5,
      musdDebt: 10_000,
      btcPriceUsd: 20_000,
    };
    const r = reverseStress(leveraged, 300);
    expect(r.priceUsd).toBeCloseTo(60_000, 8);
    expect(r.alreadyBreached).toBe(true);
  });
});
