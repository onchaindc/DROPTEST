import { describe, expect, it } from "vitest";

import { breakpointLadder, planRescue } from "./rescue";

const position = {
  btcCollateral: 0.25,
  musdDebt: 11_165,
  btcPriceUsd: 67_000,
  liquidationThresholdPct: 110,
};

describe("planRescue", () => {
  it("sizes BTC top-up and debt repayment for a shock independently", () => {
    const plan = planRescue(position, 30, 150);
    expect(plan).not.toBeNull();
    expect(plan?.shockedPriceUsd).toBeCloseTo(46_900, 6);
    expect(plan?.collateralValueAtShockUsd).toBeCloseTo(11_725, 6);
    expect(plan?.ratioAtShock).toBeCloseTo(11_725 / 11_165, 8);
    expect(plan?.survives).toBe(false);
    // Target collateral value = 1.5 × 11,165 = 16,747.5.
    expect(plan?.btcToAdd).toBeCloseTo((16_747.5 - 11_725) / 46_900, 10);
    // Target debt = 11,725 / 1.5 = 7,816.67.
    expect(plan?.musdToRepay).toBeCloseTo(11_165 - 11_725 / 1.5, 8);
    expect(plan?.headroomDropPct).toBe(0);
  });

  it("needs nothing when the position already meets the target at the shock", () => {
    const plan = planRescue(position, 0, 150);
    expect(plan?.survives).toBe(true);
    expect(plan?.btcToAdd).toBe(0);
    expect(plan?.musdToRepay).toBe(0);
    expect(plan?.shockedPriceUsd).toBe(67_000);
  });

  it("reports headroom above the threshold at a mild shock", () => {
    // A 10% drop leaves a 135% ratio, above a 130% target.
    const plan = planRescue(position, 10, 130);
    expect(plan?.survives).toBe(true);
    // Liquidation price stays 49,126; shocked price 60,300.
    expect(plan?.headroomDropPct).toBeCloseTo(
      (1 - 49_126 / 60_300) * 100,
      4,
    );
  });

  it("returns null for impossible inputs", () => {
    expect(planRescue(position, 100, 150)).toBeNull();
    expect(planRescue(position, 30, 0)).toBeNull();
    expect(planRescue({ ...position, btcCollateral: 0 }, 30, 150)).toBeNull();
  });
});

describe("breakpointLadder", () => {
  it("solves each documented ratio target to a price", () => {
    const ladder = breakpointLadder(position);
    expect(ladder).toHaveLength(5);
    const byTarget = Object.fromEntries(
      ladder.map((b) => [b.targetRatioPct, b]),
    );
    expect(byTarget[110].priceUsd).toBeCloseTo(49_126, 6);
    expect(byTarget[150].priceUsd).toBeCloseTo(66_990, 6);
    expect(byTarget[200].priceUsd).toBeCloseTo(89_320, 6);
    expect(byTarget[110].alreadyBreached).toBe(false);
    expect(byTarget[110].dropFromSpotPct).toBeCloseTo(
      (1 - 49_126 / 67_000) * 100,
      4,
    );
    // 300% sits above spot: it needs a rally, so it is already "breached".
    expect(byTarget[300].alreadyBreached).toBe(true);
    expect(byTarget[300].dropFromSpotPct).toBe(0);
  });

  it("skips non-positive and non-finite targets", () => {
    expect(breakpointLadder(position, [0, -10, Number.NaN, 150])).toHaveLength(1);
  });
});
