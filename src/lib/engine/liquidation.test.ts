import { describe, expect, it } from "vitest";

import {
  LIQUIDATION_GAS_COMPENSATION_MUSD,
  LIQUIDATOR_REWARD_PCT,
  liquidationStatement,
  STABILITY_POOL_SHARE_PCT,
} from "./liquidation";

const position = {
  btcCollateral: 0.25,
  musdDebt: 11_165,
  btcPriceUsd: 67_000,
  liquidationThresholdPct: 110,
};

describe("liquidationStatement", () => {
  it("splits collateral between the liquidator and the Stability Pool", () => {
    const s = liquidationStatement(position);
    expect(s).not.toBeNull();
    expect(s?.liquidationPriceUsd).toBeCloseTo(49_126, 6);
    // At the threshold, collateral is exactly 110% of debt.
    expect(s?.collateralValueUsd).toBeCloseTo(12_281.5, 6);
    expect(s?.liquidatorRewardUsd).toBeCloseTo(
      (12_281.5 * LIQUIDATOR_REWARD_PCT) / 100,
      8,
    );
    expect(s?.stabilityPoolCollateralUsd).toBeCloseTo(12_281.5 * 0.995, 8);
    expect(STABILITY_POOL_SHARE_PCT).toBe(99.5);
    expect(s?.gasCompensationMusd).toBe(LIQUIDATION_GAS_COMPENSATION_MUSD);
    expect(s?.modelledBorrowerResidualUsd).toBe(0);
  });

  it("leaves a positive surplus for the pool on a position liquidated at 110%", () => {
    const s = liquidationStatement(position);
    // 99.5% of 12,281.5 = 12,220.09; minus 11,165 debt and 200 gas comp.
    expect(s?.surplusAfterDebtUsd).toBeCloseTo(855.0925, 4);
  });

  it("derives the price where seized collateral stops covering debt", () => {
    const s = liquidationStatement(position);
    const expected = (11_165 + 200) / (0.995 * 0.25);
    expect(s?.badDebtPriceUsd).toBeCloseTo(expected, 6);
    expect(s?.badDebtPossible).toBe(true);
    expect(s?.badDebtPriceUsd).toBeLessThan(s!.liquidationPriceUsd);
  });

  it("shows bad debt at a higher threshold where the reward eats the buffer", () => {
    // At 100% threshold the trove liquidates with collateral == debt, so
    // the 0.5% reward plus 200 MUSD leaves the pool short.
    const s = liquidationStatement({ ...position, liquidationThresholdPct: 100 });
    expect(s?.surplusAfterDebtUsd).toBeLessThan(0);
  });

  it("returns null for unusable positions", () => {
    expect(liquidationStatement({ ...position, btcCollateral: 0 })).toBeNull();
    expect(liquidationStatement({ ...position, musdDebt: Number.NaN })).toBeNull();
    expect(
      liquidationStatement({ ...position, liquidationThresholdPct: 0 }),
    ).toBeNull();
  });
});
