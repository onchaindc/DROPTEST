/**
 * Rescue planning and breakpoint ladders.
 *
 * Two questions the original lab could not answer after a shock:
 *   "If BTC drops X%, what do I add or repay to stay above a ratio?"
 *   "At what prices does my ratio hit 125 / 150 / 200%?"
 *
 * Both are pure inversions of the same collateral-ratio formula the
 * engine already tests, so nothing new is assumed. Adding collateral
 * and repaying debt are modelled as *alternatives*: doing both at once
 * is possible but unnecessary, and mixing them would need a weighting
 * the product does not ask for.
 */
import {
  clampDropPct,
  computeLiquidationPriceUsd,
  reverseStress,
  stateAtPrice,
  type PositionInput,
  type RiskModelInput,
} from "./risk";

/** Ratio targets shown in the breakpoint ladder, in percent. */
export const BREAKPOINT_TARGETS_PCT = [110, 125, 150, 200, 300] as const;

export interface Breakpoint {
  targetRatioPct: number;
  /** BTC price at which the ratio equals the target. */
  priceUsd: number;
  /** Percent drop from spot required to reach it (0 when already below). */
  dropFromSpotPct: number;
  /** True when the position is already below this target at spot. */
  alreadyBreached: boolean;
}

/** Prices at which the position hits each ratio target. */
export function breakpointLadder(
  input: PositionInput,
  targets: readonly number[] = BREAKPOINT_TARGETS_PCT,
): Breakpoint[] {
  const rows: Breakpoint[] = [];
  for (const target of targets) {
    if (!Number.isFinite(target) || target <= 0) continue;
    const solved = reverseStress(input, target);
    rows.push({
      targetRatioPct: target,
      priceUsd: solved.priceUsd,
      dropFromSpotPct: solved.dropFromSpotPct,
      alreadyBreached: solved.alreadyBreached,
    });
  }
  return rows;
}

export interface RescuePlan {
  /** Price drop from spot that the plan is sized for. */
  shockDropPct: number;
  shockedPriceUsd: number;
  /** Ratio at the shocked price with the position unchanged. */
  ratioAtShock: number;
  /** True when the unchanged position already meets the target at the shock. */
  survives: boolean;
  targetRatioPct: number;
  /** BTC to add to reach the target at the shocked price. */
  btcToAdd: number;
  /** MUSD to repay to reach the target at the shocked price (no BTC added). */
  musdToRepay: number;
  /** Collateral value at the shocked price with the unchanged position. */
  collateralValueAtShockUsd: number;
  /** Additional drop available before the threshold is breached, 0 when breached. */
  headroomDropPct: number;
}

/**
 * Size the rescue for a hypothetical shock.
 *
 * Adding BTC at the shocked price raises collateral value; repaying
 * MUSD lowers the target value. Both solve
 *   targetRatio/100 × debt = collateralValue
 * in their own variable, so the two numbers are independent options,
 * not a combined plan.
 */
export function planRescue(
  input: RiskModelInput,
  shockDropPct: number,
  targetRatioPct: number,
): RescuePlan | null {
  const { btcCollateral, musdDebt, btcPriceUsd, liquidationThresholdPct } = input;
  const drop = clampDropPct(shockDropPct);
  if (
    !Number.isFinite(btcCollateral) ||
    !Number.isFinite(musdDebt) ||
    !Number.isFinite(btcPriceUsd) ||
    !Number.isFinite(targetRatioPct) ||
    btcCollateral <= 0 ||
    musdDebt <= 0 ||
    btcPriceUsd <= 0 ||
    targetRatioPct <= 0
  ) {
    return null;
  }
  const shockedPriceUsd = btcPriceUsd * (1 - drop / 100);
  if (!(shockedPriceUsd > 0)) return null;
  const state = stateAtPrice(btcCollateral, musdDebt, shockedPriceUsd);
  const targetRatio = targetRatioPct / 100;
  const targetValueUsd = targetRatio * musdDebt;
  const collateralValueAtShockUsd = btcCollateral * shockedPriceUsd;
  const btcToAdd = Math.max(
    0,
    (targetValueUsd - collateralValueAtShockUsd) / shockedPriceUsd,
  );
  const musdToRepay = Math.max(
    0,
    musdDebt - collateralValueAtShockUsd / targetRatio,
  );
  const liquidationPriceUsd = Number.isFinite(liquidationThresholdPct)
    ? computeLiquidationPriceUsd(btcCollateral, musdDebt, liquidationThresholdPct)
    : Number.NaN;
  const headroomDropPct = liquidationPriceUsd > shockedPriceUsd
    ? 0
    : (1 - liquidationPriceUsd / shockedPriceUsd) * 100;
  return {
    shockDropPct: drop,
    shockedPriceUsd,
    ratioAtShock: state.collateralRatio,
    survives: state.collateralRatio >= targetRatio,
    targetRatioPct,
    btcToAdd: Number.isFinite(btcToAdd) ? btcToAdd : 0,
    musdToRepay: Number.isFinite(musdToRepay) ? musdToRepay : 0,
    collateralValueAtShockUsd,
    headroomDropPct,
  };
}
