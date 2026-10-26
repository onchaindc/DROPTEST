import { clampDropPct, stateAtPrice, type RiskModelInput } from "./risk";

/**
 * Named hypothetical price paths, compared side by side in the
 * Scenario Studio. A path is a sequence of successive price drops
 * between steps (for example weeks or months). The existing risk
 * engine does all the math: each step is evaluated with the same
 * stateAtPrice formula the lab uses.
 */
export interface PricePath {
  /** Stable id for React keys and local storage. */
  id: string;
  /** User-editable display name, e.g. "Slow bleed". */
  name: string;
  /** Unit of time between steps, e.g. "Week", "Month", "Day". */
  stepLabel: string;
  /** Percent drop applied between step i and step i+1 (clamped 0..100). */
  dropPcts: number[];
}

export interface PathPoint {
  /** 1-based step number. */
  step: number;
  /** Human label, e.g. "Week 3". */
  label: string;
  /** Percent drop from the starting spot price this point represents. */
  cumulativeDropPct: number;
  priceUsd: number;
  collateralValueUsd: number;
  collateralRatio: number;
  /** Strictly below the liquidation threshold, matching engine wording. */
  liquidated: boolean;
}

export interface PathBreach {
  step: number;
  label: string;
  cumulativeDropPct: number;
  priceUsd: number;
}

export interface PathSummary {
  lowestRatio: number;
  /** Price at which the lowest ratio occurs (monotone falling paths). */
  lowestRatioPriceUsd: number;
  /** First step whose ratio falls strictly below the threshold, if any. */
  firstBreach: PathBreach | null;
  /** Collateral value at the final step of the path. */
  endingCollateralValueUsd: number;
  endingCollateralRatio: number;
  endingPriceUsd: number;
  /** Largest cumulative drop along the path, in percent. */
  maxCumulativeDropPct: number;
}

/**
 * Evaluate the position at every step along a path. The threshold
 * comparison is the same "falls below" rule the engine tests pin down:
 * equality with the threshold is not a breach.
 */
export function analyzePricePath(
  input: RiskModelInput,
  path: PricePath,
): PathPoint[] {
  const threshold = input.liquidationThresholdPct / 100;
  let price = input.btcPriceUsd;
  const points: PathPoint[] = [];
  path.dropPcts.forEach((drop, i) => {
    price = price * (1 - clampDropPct(drop) / 100);
    // "Cumulative" means the actual percent change from spot, not the
    // sum of stage drops: a 50% drop followed by a 50% drop is a 75%
    // cumulative drop, not 100%.
    const cumulative =
      input.btcPriceUsd > 0
        ? clampDropPct((1 - price / input.btcPriceUsd) * 100)
        : 0;
    const state = stateAtPrice(input.btcCollateral, input.musdDebt, price);
    points.push({
      step: i + 1,
      label: `${path.stepLabel} ${i + 1}`,
      cumulativeDropPct: cumulative,
      priceUsd: price,
      collateralValueUsd: state.collateralValueUsd,
      collateralRatio: state.collateralRatio,
      liquidated: state.collateralRatio < threshold,
    });
  });
  return points;
}

/** Roll up a path into the headline numbers the studio table shows. */
export function summarizePricePath(
  input: RiskModelInput,
  path: PricePath,
): PathSummary {
  const points = analyzePricePath(input, path);
  let lowest = points[0];
  for (const p of points) {
    if (p.collateralRatio < lowest.collateralRatio) lowest = p;
  }
  const firstBreach = points.find((p) => p.liquidated) ?? null;
  const last = points.length > 0 ? points[points.length - 1] : null;
  const spotState = stateAtPrice(
    input.btcCollateral,
    input.musdDebt,
    input.btcPriceUsd,
  );
  return {
    lowestRatio: lowest ? lowest.collateralRatio : spotState.collateralRatio,
    lowestRatioPriceUsd: lowest ? lowest.priceUsd : input.btcPriceUsd,
    firstBreach: firstBreach
      ? {
          step: firstBreach.step,
          label: firstBreach.label,
          cumulativeDropPct: firstBreach.cumulativeDropPct,
          priceUsd: firstBreach.priceUsd,
        }
      : null,
    endingCollateralValueUsd: last
      ? last.collateralValueUsd
      : spotState.collateralValueUsd,
    endingCollateralRatio: last ? last.collateralRatio : spotState.collateralRatio,
    endingPriceUsd: last ? last.priceUsd : input.btcPriceUsd,
    maxCumulativeDropPct: last ? last.cumulativeDropPct : 0,
  };
}

/**
 * Built-in path presets. These are UI defaults, not protocol facts and
 * not predictions. Steps are successive percent drops between steps.
 */
export const PATH_PRESETS: PricePath[] = [
  {
    id: "gradual-decline",
    name: "Gradual decline",
    stepLabel: "Month",
    dropPcts: [4, 4, 4, 4, 4, 4, 4, 4],
  },
  {
    id: "sudden-crash",
    name: "Sudden crash",
    stepLabel: "Day",
    dropPcts: [12, 8, 4, 1, 0, 0],
  },
  {
    id: "prolonged-bear",
    name: "Prolonged bear market",
    stepLabel: "Quarter",
    dropPcts: [20, 10, 8, 6, 5],
  },
];
