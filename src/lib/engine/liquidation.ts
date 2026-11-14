/**
 * Liquidation cost statement.
 *
 * Every constant here is from the mUSD documentation: when a trove is
 * liquidated, the liquidator receives 0.5% of the trove's collateral
 * plus a flat 200 MUSD gas compensation, and the Stability Pool burns
 * MUSD against the debt and seizes the remaining collateral.
 *
 * The statement adds one derived number the docs do not publish: the
 * price at which the seized collateral (after the liquidator's share
 * and the gas compensation) no longer covers the debt, i.e. where bad
 * debt starts. That is algebra over documented parameters, not a new
 * protocol constant, and the UI labels it as derived.
 *
 * The app's existing disclosure still applies: the docs describe a
 * liquidator reward, not a borrower-facing penalty, and the model shows
 * the borrower keeping nothing from a liquidated position.
 */
import {
  computeLiquidationPriceUsd,
  type RiskModelInput,
} from "./risk";

/** Liquidator's share of seized collateral, per the mUSD docs. */
export const LIQUIDATOR_REWARD_PCT = 0.5;
/** Flat MUSD gas compensation paid on liquidation, per the mUSD docs. */
export const LIQUIDATION_GAS_COMPENSATION_MUSD = 200;
/** Collateral share the Stability Pool receives. */
export const STABILITY_POOL_SHARE_PCT = 100 - LIQUIDATOR_REWARD_PCT;

export const LIQUIDATION_DOCS_SOURCE =
  "https://github.com/mezo-org/musd/blob/main/docs/README.md";

export interface LiquidationStatement {
  liquidationThresholdPct: number;
  liquidationPriceUsd: number;
  /** Collateral value at the liquidation price. */
  collateralValueUsd: number;
  debtMusd: number;
  /** 0.5% of collateral value, paid to the liquidator in collateral. */
  liquidatorRewardUsd: number;
  /** 200 MUSD gas compensation. */
  gasCompensationMusd: number;
  /** Collateral value routed to the Stability Pool after the reward. */
  stabilityPoolCollateralUsd: number;
  /**
   * Seized collateral less the reward and gas compensation, minus debt.
   * Positive means the pool can fully absorb the trove and still has
   * value left; negative is bad debt.
   */
  surplusAfterDebtUsd: number;
  /**
   * Price at which 99.5% of collateral equals debt + 200 MUSD gas
   * compensation. Below it, a liquidation leaves bad debt. Derived from
   * the documented parameters.
   */
  badDebtPriceUsd: number;
  /** True when the bad-debt price is below the liquidation price. */
  badDebtPossible: boolean;
  /** Borrower's modelled residual, which is zero in this model. */
  modelledBorrowerResidualUsd: number;
}

/**
 * Full liquidation statement for a position at its own liquidation
 * price. Returns null for positions the engine cannot model.
 */
export function liquidationStatement(
  input: RiskModelInput,
): LiquidationStatement | null {
  const { btcCollateral, musdDebt, liquidationThresholdPct } = input;
  if (
    !Number.isFinite(btcCollateral) ||
    !Number.isFinite(musdDebt) ||
    !Number.isFinite(liquidationThresholdPct) ||
    btcCollateral <= 0 ||
    musdDebt <= 0 ||
    liquidationThresholdPct <= 0
  ) {
    return null;
  }
  const liquidationPriceUsd = computeLiquidationPriceUsd(
    btcCollateral,
    musdDebt,
    liquidationThresholdPct,
  );
  const collateralValueUsd = btcCollateral * liquidationPriceUsd;
  const liquidatorRewardUsd = (collateralValueUsd * LIQUIDATOR_REWARD_PCT) / 100;
  const stabilityPoolCollateralUsd = collateralValueUsd - liquidatorRewardUsd;
  const surplusAfterDebtUsd =
    stabilityPoolCollateralUsd - musdDebt - LIQUIDATION_GAS_COMPENSATION_MUSD;
  const badDebtPriceUsd =
    (musdDebt + LIQUIDATION_GAS_COMPENSATION_MUSD) /
    ((STABILITY_POOL_SHARE_PCT / 100) * btcCollateral);
  return {
    liquidationThresholdPct,
    liquidationPriceUsd,
    collateralValueUsd,
    debtMusd: musdDebt,
    liquidatorRewardUsd,
    gasCompensationMusd: LIQUIDATION_GAS_COMPENSATION_MUSD,
    stabilityPoolCollateralUsd,
    surplusAfterDebtUsd,
    badDebtPriceUsd,
    badDebtPossible: badDebtPriceUsd < liquidationPriceUsd,
    modelledBorrowerResidualUsd: 0,
  };
}
