/**
 * DROPTEST risk engine — pure functions only.
 *
 * All formulas here are standard collateral-ratio math over a
 * hypothetical BTC/MUSD position. Protocol-specific parameters
 * (liquidation threshold etc.) are always passed in explicitly, never
 * baked in, so the engine stays honest about what is an assumption.
 */

export interface PositionInput {
  /** BTC collateral amount in BTC (positive number). */
  btcCollateral: number;
  /** Total MUSD debt (positive number). */
  musdDebt: number;
  /** Spot BTC price in USD (positive number). */
  btcPriceUsd: number;
}

export interface ScenarioShock {
  /** Id for stable React keys / UI mapping. */
  id: string;
  /** Human label, e.g. "Moderate pullback". */
  label: string;
  /** Price shock in positive percent, e.g. 25 for a −25% price move. */
  dropPct: number;
}

export interface PositionState {
  /** Effective collateral value in USD at a given price. */
  collateralValueUsd: number;
  /** Collateral ratio (collateralValue / debt). Finite when debt > 0. */
  collateralRatio: number;
  /** Loan-to-value ratio, 0..∞ (debt / collateralValue). */
  ltv: number;
}

export interface ScenarioState extends PositionState {
  id: string;
  label: string;
  dropPct: number;
  /** Price after the shock. */
  shockedPriceUsd: number;
  /** True when collateral ratio falls strictly below the threshold (per docs wording: liquidatable when "falls below"). */
  liquidated: boolean;
  /**
   * Additional price drop (percent) this scenario state can absorb
   * before hitting the liquidation threshold, 0 when already under.
   */
  headroomDropPct: number;
}

export interface RiskMetrics extends PositionState {
  /** USD price at which the position's collateral ratio hits the configured threshold. */
  liquidationPriceUsd: number;
  /** Drop from spot to liquidation price, in percent (0 if already at/below threshold). */
  dropToLiquidationPct: number;
  /** Value the position would lose if liquidated at its threshold price. */
  collateralAtLiquidationUsd: number;
  /** Extra USD the collateral would need for the position to reach a target ratio. */
  collateralDeficitToTargetUsd: (targetRatioPct: number) => number;
}

export interface RiskModelInput extends PositionInput {
  /** User-configurable liquidation threshold in percent (e.g. 110). */
  liquidationThresholdPct: number;
}

export class InvalidPositionError extends Error {}

export function validatePosition(input: PositionInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.btcCollateral) || input.btcCollateral <= 0) {
    errors.push("BTC collateral must be a positive number.");
  }
  if (!Number.isFinite(input.musdDebt) || input.musdDebt <= 0) {
    errors.push("MUSD debt must be a positive number.");
  }
  if (!Number.isFinite(input.btcPriceUsd) || input.btcPriceUsd <= 0) {
    errors.push("BTC price must be a positive number.");
  }
  return errors;
}

/**
 * Ratio at the price where collateral value equals exactly
 * `thresholdPct / 100` of debt:
 *
 *   liquidationPrice = debt × threshold / (100 × btc)
 */
export function computeLiquidationPriceUsd(
  btcCollateral: number,
  musdDebt: number,
  liquidationThresholdPct: number,
): number {
  if (!(liquidationThresholdPct > 0)) throw new InvalidPositionError("Threshold must be > 0");
  return (musdDebt * liquidationThresholdPct) / (100 * btcCollateral);
}

export function stateAtPrice(
  btcCollateral: number,
  musdDebt: number,
  priceUsd: number,
): PositionState {
  const collateralValueUsd = btcCollateral * priceUsd;
  const collateralRatio = collateralValueUsd / musdDebt;
  return {
    collateralValueUsd,
    collateralRatio,
    ltv: collateralRatio === 0 ? Infinity : musdDebt / collateralValueUsd,
  };
}

/**
 * Main entry point: full risk metrics for a hypothetical position.
 *
 * Ratio math (docs-consistent):
 *   collateralRatio = collateralValue / totalDebt
 *   liquidatable ⇔ collateralRatio < threshold   (docs: "falls below 110%")
 *
 * Liquidation outcome (verified mezo-org/musd docs): the trove's
 * collateral is fully seized — 0.5% as the liquidator's reward, 99.5%
 * burned against debt by the Stability Pool — so the borrower retains
 * no residual collateral in this model.
 */
export function analyze(input: RiskModelInput): RiskMetrics {
  const errors = validatePosition(input);
  if (errors.length > 0) throw new InvalidPositionError(errors.join(" "));
  if (!Number.isFinite(input.liquidationThresholdPct) || input.liquidationThresholdPct <= 0) {
    throw new InvalidPositionError("Liquidation threshold must be a positive number.");
  }

  const { btcCollateral, musdDebt, btcPriceUsd } = input;
  const base = stateAtPrice(btcCollateral, musdDebt, btcPriceUsd);
  const liquidationPriceUsd = computeLiquidationPriceUsd(
    btcCollateral,
    musdDebt,
    input.liquidationThresholdPct,
  );
  const liquidationRatioAtSpot = liquidationPriceUsd / btcPriceUsd;
  const dropToLiquidationPct = Math.max(0, (1 - liquidationRatioAtSpot) * 100);

  return {
    ...base,
    liquidationPriceUsd,
    dropToLiquidationPct,
    collateralAtLiquidationUsd: btcCollateral * liquidationPriceUsd,
    collateralDeficitToTargetUsd(targetRatioPct: number): number {
      const targetValueUsd = (targetRatioPct / 100) * musdDebt;
      if (!Number.isFinite(targetRatioPct) || targetRatioPct < 0) {
        throw new InvalidPositionError("Target ratio must be a non-negative number.");
      }
      return Math.max(0, targetValueUsd - btcCollateral * btcPriceUsd);
    },
  };
}

/**
 * Apply a set of price-shock scenarios to a position and classify each.
 */
export function applyScenarios(input: RiskModelInput, scenarios: ScenarioShock[]): ScenarioState[] {
  const errors = validatePosition(input);
  if (errors.length > 0) throw new InvalidPositionError(errors.join(" "));
  const { btcCollateral, musdDebt } = input;
  const liquidationPriceUsd = computeLiquidationPriceUsd(
    btcCollateral,
    musdDebt,
    input.liquidationThresholdPct,
  );

  return scenarios.map((scenario) => {
    const dropPct = clampDropPct(scenario.dropPct);
    const shockedPriceUsd = input.btcPriceUsd * (1 - dropPct / 100);
    const atPrice = stateAtPrice(btcCollateral, musdDebt, shockedPriceUsd);
    // Docs wording: a trove is liquidatable when its ratio "falls
    // below" the threshold — equality is the exact boundary and is not
    // below it (tested).
    const liquidated = atPrice.collateralRatio < input.liquidationThresholdPct / 100;
    const headroom = liquidationPriceUsd > shockedPriceUsd
      ? 0
      : (1 - liquidationPriceUsd / shockedPriceUsd) * 100;
    return {
      id: scenario.id,
      label: scenario.label,
      dropPct,
      shockedPriceUsd,
      liquidated,
      headroomDropPct: liquidated ? 0 : headroom,
      ...atPrice,
    };
  });
}

/**
 * Reverse stress test: solve for the BTC price at which the position's
 * collateral ratio reaches a user-chosen target, in percent.
 *
 * This inverts the ratio formula:
 *   price = (targetRatio / 100) × debt / btc
 * which is the same algebra as computeLiquidationPriceUsd, with the
 * target chosen by the user instead of the documented 110% threshold.
 */
export interface ReverseStressResult {
  /** The user-selected ratio target, unchanged. */
  targetRatioPct: number;
  /** Price at which collateralRatio === targetRatioPct / 100. */
  priceUsd: number;
  /** Percent drop from spot required to reach the target, 0 when breached. */
  dropFromSpotPct: number;
  /** True when the position is already below the target at spot. */
  alreadyBreached: boolean;
}

export function reverseStress(
  input: PositionInput,
  targetRatioPct: number,
): ReverseStressResult {
  const errors = validatePosition(input);
  if (errors.length > 0) throw new InvalidPositionError(errors.join(" "));
  if (!Number.isFinite(targetRatioPct) || targetRatioPct <= 0) {
    throw new InvalidPositionError(
      "Target collateral ratio must be a positive number.",
    );
  }
  const priceUsd = computeLiquidationPriceUsd(
    input.btcCollateral,
    input.musdDebt,
    targetRatioPct,
  );
  const alreadyBreached = priceUsd > input.btcPriceUsd;
  const dropFromSpotPct = Math.max(0, (1 - priceUsd / input.btcPriceUsd) * 100);
  return {
    targetRatioPct,
    priceUsd,
    dropFromSpotPct,
    alreadyBreached,
  };
}

export function clampDropPct(dropPct: number): number {
  if (!Number.isFinite(dropPct)) return 0;
  return Math.min(100, Math.max(0, dropPct));
}

/**
 * Cumulative crash path: each stage multiplies a rolling price factor.
 * Stage i price = spot × ∏ (1 − dropPct_i / 100).
 */
export function cumulativePricePath(spotPriceUsd: number, dropsPct: number[]): number[] {
  const prices: number[] = [];
  let price = spotPriceUsd;
  for (const drop of dropsPct) {
    price = price * (1 - clampDropPct(drop) / 100);
    prices.push(price);
  }
  return prices;
}
