import { describe, expect, it } from "vitest";

import {
  daysUntilInterestReachesLiquidation,
  projectInterest,
} from "./interest";

describe("projectInterest", () => {
  const position = {
    btcCollateral: 1,
    musdDebt: 10_000,
    btcPriceUsd: 20_000,
    liquidationThresholdPct: 110,
  };

  it("grows debt with simple interest and moves the liquidation price up", () => {
    const p = projectInterest(position, 3);
    expect(p).not.toBeNull();
    expect(p?.annualInterestMusd).toBeCloseTo(300, 8);
    expect(p?.baseLiquidationPriceUsd).toBeCloseTo(11_000, 8);
    expect(p?.horizons).toHaveLength(4);
    const [d30, d90, d180, d365] = p!.horizons;
    expect(d30.debtMusd).toBeCloseTo(10_000 * (1 + 0.03 * (30 / 365)), 8);
    expect(d90.debtMusd).toBeCloseTo(10_000 * (1 + 0.03 * (90 / 365)), 8);
    expect(d180.debtMusd).toBeCloseTo(10_000 * (1 + 0.03 * (180 / 365)), 8);
    expect(d365.debtMusd).toBeCloseTo(10_300, 8);
    expect(d365.interestMusd).toBeCloseTo(300, 8);
    // Debt grows monotonically, so the liquidation price does too.
    expect(d30.liquidationPriceUsd).toBeLessThan(d90.liquidationPriceUsd);
    expect(d90.liquidationPriceUsd).toBeLessThan(d180.liquidationPriceUsd);
    expect(d365.liquidationPriceUsd).toBeCloseTo(11_330, 6);
    // Ratio at the unchanged spot price falls as debt grows.
    expect(d365.collateralRatio).toBeLessThan(d30.collateralRatio);
    expect(d365.dropToLiquidationPct).toBeLessThan(d30.dropToLiquidationPct);
  });

  it("flags a position that interest alone pushes under the threshold", () => {
    const p = projectInterest(
      { btcCollateral: 1, musdDebt: 10_000, btcPriceUsd: 11_100, liquidationThresholdPct: 110 },
      5,
      [365],
    );
    expect(p?.horizons[0].liquidatedByInterest).toBe(true);
  });

  it("returns null for unusable rates and positions", () => {
    expect(projectInterest(position, -1)).toBeNull();
    expect(projectInterest(position, 100)).toBeNull();
    expect(projectInterest(position, Number.NaN)).toBeNull();
    expect(projectInterest({ ...position, btcCollateral: 0 }, 3)).toBeNull();
  });

  it("filters out non-positive horizons", () => {
    const p = projectInterest(position, 3, [0, -30, 30, Number.NaN]);
    expect(p?.horizons).toHaveLength(1);
    expect(p?.horizons[0].days).toBe(30);
  });
});

describe("daysUntilInterestReachesLiquidation", () => {
  it("solves the day at which grown debt meets spot", () => {
    // Max debt before liquidation = 20,000 / 1.1 = 18,181.8; 5% of 10,000 = 500/yr.
    const days = daysUntilInterestReachesLiquidation(
      { btcCollateral: 1, musdDebt: 10_000, btcPriceUsd: 20_000, liquidationThresholdPct: 110 },
      5,
    );
    expect(days).toBeCloseTo(((18_181.8181 - 10_000) / 500) * 365, 1);
  });

  it("returns zero when already liquidatable and infinite at a zero rate", () => {
    expect(
      daysUntilInterestReachesLiquidation(
        { btcCollateral: 1, musdDebt: 20_000, btcPriceUsd: 20_000, liquidationThresholdPct: 110 },
        5,
      ),
    ).toBe(0);
    expect(
      daysUntilInterestReachesLiquidation(
        { btcCollateral: 1, musdDebt: 10_000, btcPriceUsd: 20_000, liquidationThresholdPct: 110 },
        0,
      ),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns null for an invalid position", () => {
    expect(
      daysUntilInterestReachesLiquidation(
        { btcCollateral: 0, musdDebt: 10_000, btcPriceUsd: 20_000, liquidationThresholdPct: 110 },
        5,
      ),
    ).toBeNull();
  });
});
