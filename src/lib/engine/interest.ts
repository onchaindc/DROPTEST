/**
 * Interest drag on an MUSD position.
 *
 * Mezo documents fixed interest of 1–5% APR, fixed when the loan opens,
 * and does not publish a live rate. A live trove does expose its own
 * fixed per-trove rate (`Troves(address).interestRate`, read elsewhere
 * in the app), which is the only on-chain rate DROPTEST can show.
 *
 * The projection below is therefore always labelled as an assumption
 * unless the caller passes a rate that came from the chain. It uses the
 * same simple-interest function as the existing projections, and it
 * deliberately runs the *whole position* forward: more debt means a
 * higher liquidation price and less headroom at the same spot price.
 */
import { projectDebt } from "./historical";
import { computeLiquidationPriceUsd, stateAtPrice, type RiskModelInput } from "./risk";

export const INTEREST_PROJECTION_HORIZONS = [30, 90, 180, 365] as const;

export interface InterestHorizon {
  days: number;
  /** Debt after simple interest on the entered principal. */
  debtMusd: number;
  /** Interest added, in MUSD. */
  interestMusd: number;
  /** Collateral ratio at the unchanged spot price. */
  collateralRatio: number;
  /** Liquidation price at the configured threshold with the grown debt. */
  liquidationPriceUsd: number;
  /** Additional price drop this grown position can absorb. */
  dropToLiquidationPct: number;
  /** True when interest alone has pushed the ratio below the threshold. */
  liquidatedByInterest: boolean;
}

export interface InterestProjection {
  annualRatePct: number;
  /** Annual interest on the entered debt, before compounding. */
  annualInterestMusd: number;
  inputs: RiskModelInput;
  /** Liquidation price at day 0, so the table can show the drift. */
  baseLiquidationPriceUsd: number;
  horizons: InterestHorizon[];
}

/**
 * Project a position forward along a fixed-rate assumption.
 * Returns null for inputs or rates the model cannot represent
 * (a rate must be finite, non-negative, and below 100%).
 */
export function projectInterest(
  input: RiskModelInput,
  annualRatePct: number,
  horizons: readonly number[] = INTEREST_PROJECTION_HORIZONS,
): InterestProjection | null {
  const { btcCollateral, musdDebt, btcPriceUsd, liquidationThresholdPct } = input;
  if (
    !Number.isFinite(btcCollateral) ||
    !Number.isFinite(musdDebt) ||
    !Number.isFinite(btcPriceUsd) ||
    !Number.isFinite(liquidationThresholdPct) ||
    !Number.isFinite(annualRatePct) ||
    btcCollateral <= 0 ||
    musdDebt <= 0 ||
    btcPriceUsd <= 0 ||
    liquidationThresholdPct <= 0 ||
    annualRatePct < 0 ||
    annualRatePct >= 100
  ) {
    return null;
  }
  const baseLiquidationPriceUsd = computeLiquidationPriceUsd(
    btcCollateral,
    musdDebt,
    liquidationThresholdPct,
  );
  const rows: InterestHorizon[] = horizons
    .filter((d) => Number.isFinite(d) && d > 0)
    .map((days) => {
      const debtMusd = projectDebt({
        principal: musdDebt,
        annualRatePct,
        days,
      });
      const state = stateAtPrice(btcCollateral, debtMusd, btcPriceUsd);
      const liquidationPriceUsd = computeLiquidationPriceUsd(
        btcCollateral,
        debtMusd,
        liquidationThresholdPct,
      );
      return {
        days,
        debtMusd,
        interestMusd: debtMusd - musdDebt,
        collateralRatio: state.collateralRatio,
        liquidationPriceUsd,
        dropToLiquidationPct: Math.max(
          0,
          (1 - liquidationPriceUsd / btcPriceUsd) * 100,
        ),
        liquidatedByInterest:
          state.collateralRatio < liquidationThresholdPct / 100,
      };
    });
  return {
    annualRatePct,
    annualInterestMusd: (musdDebt * annualRatePct) / 100,
    inputs: input,
    baseLiquidationPriceUsd,
    horizons: rows,
  };
}

/**
 * Days of interest that erase the current headroom: the point where
 * the liquidation price rises to the spot price. Infinite when there is
 * no headroom left or no rate. Used for the "how long do you have"
 * readout.
 */
export function daysUntilInterestReachesLiquidation(
  input: RiskModelInput,
  annualRatePct: number,
): number | null {
  const projection = projectInterest(input, annualRatePct, [365]);
  if (projection === null) return null;
  const { btcCollateral, musdDebt, btcPriceUsd, liquidationThresholdPct } = input;
  // At the liquidation boundary, collateral × price = threshold × debt.
  const maxDebtBeforeLiquidation =
    (btcCollateral * btcPriceUsd) / (liquidationThresholdPct / 100);
  if (!Number.isFinite(maxDebtBeforeLiquidation)) return null;
  if (maxDebtBeforeLiquidation <= musdDebt) return 0;
  if (annualRatePct <= 0) return Number.POSITIVE_INFINITY;
  const annualInterest = (musdDebt * annualRatePct) / 100;
  return ((maxDebtBeforeLiquidation - musdDebt) / annualInterest) * 365;
}
