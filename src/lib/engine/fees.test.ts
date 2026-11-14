import { describe, expect, it } from "vitest";

import {
  borrowingCosts,
  debtWithIssuanceFee,
  GAS_DEPOSIT_MUSD,
  ISSUANCE_FEE_PCT,
  redemptionImpact,
} from "./fees";

describe("borrowingCosts", () => {
  it("applies the documented 0.1% issuance fee and 200 MUSD gas deposit", () => {
    const c = borrowingCosts(10_000);
    expect(c).not.toBeNull();
    expect(c?.issuanceFeePct).toBe(ISSUANCE_FEE_PCT);
    expect(c?.issuanceFeeMusd).toBeCloseTo(10, 8);
    expect(c?.netMusdReceived).toBeCloseTo(9_990, 8);
    expect(c?.gasDepositMusd).toBe(GAS_DEPOSIT_MUSD);
    expect(c?.debtIfFeeCapitalisedMusd).toBeCloseTo(10_010, 8);
    // (10 fee + 200 deposit) / 10,000 = 2.1%
    expect(c?.upfrontCostPct).toBeCloseTo(2.1, 8);
  });

  it("returns null for amounts that cannot be a borrow", () => {
    expect(borrowingCosts(0)).toBeNull();
    expect(borrowingCosts(-1)).toBeNull();
    expect(borrowingCosts(Number.NaN)).toBeNull();
    expect(borrowingCosts(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("exposes the fee-capitalised debt as a separate helper", () => {
    expect(debtWithIssuanceFee(1_000)).toBeCloseTo(1_001, 8);
    expect(debtWithIssuanceFee(0)).toBeNull();
  });
});

describe("redemptionImpact", () => {
  const position = { btcCollateral: 0.25, musdDebt: 11_165, btcPriceUsd: 67_000 };

  it("removes debt and BTC at par, raising the ratio of an overcollateralised trove", () => {
    const before = (0.25 * 67_000) / 11_165;
    const impact = redemptionImpact(position, 1_000);
    expect(impact).not.toBeNull();
    expect(impact?.redeemedMusd).toBe(1_000);
    expect(impact?.collateralSoldBtc).toBeCloseTo(1_000 / 67_000, 10);
    expect(impact?.newDebtMusd).toBeCloseTo(10_165, 8);
    expect(impact?.newCollateralBtc).toBeCloseTo(0.25 - 1_000 / 67_000, 10);
    expect(impact?.newRatio).toBeGreaterThan(before);
    expect(impact?.ratioChangePct).toBeCloseTo((impact!.newRatio - before) * 100, 8);
    expect(impact?.closesPosition).toBe(false);
  });

  it("closes the position when the redemption exceeds the debt", () => {
    const impact = redemptionImpact(position, 20_000);
    expect(impact?.closesPosition).toBe(true);
    expect(impact?.redeemedMusd).toBe(11_165);
    expect(impact?.newDebtMusd).toBe(0);
    expect(impact?.newRatio).toBe(Number.POSITIVE_INFINITY);
    expect(impact?.newCollateralBtc).toBeGreaterThan(0);
  });

  it("rejects non-positive or non-finite redemptions and positions", () => {
    expect(redemptionImpact(position, 0)).toBeNull();
    expect(redemptionImpact(position, Number.NaN)).toBeNull();
    expect(redemptionImpact({ ...position, btcPriceUsd: 0 }, 100)).toBeNull();
    expect(redemptionImpact({ ...position, musdDebt: -5 }, 100)).toBeNull();
  });
});
