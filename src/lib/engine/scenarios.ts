import type { ScenarioShock } from "./risk";

/**
 * Preset scenario shocks. Percent values are price drops from spot.
 * These are UI defaults, not protocol facts.
 */
export const PRESET_SCENARIOS: ScenarioShock[] = [
  { id: "rotation", label: "Rotation", dropPct: 10 },
  { id: "correction", label: "Correction", dropPct: 25 },
  { id: "bear", label: "Bear leg", dropPct: 40 },
  { id: "severe", label: "Severe crash", dropPct: 60 },
  { id: "tail", label: "Tail event", dropPct: 85 },
];

/**
 * Cumulative crash path used by the scenario timeline: successive
 * stages of a single drawn-down market.
 */
export const TIMELINE_STAGES: ScenarioShock[] = [
  { id: "stage-1", label: "Stage 1 · shakeout", dropPct: 15 },
  { id: "stage-2", label: "Stage 2 · deleveraging", dropPct: 20 },
  { id: "stage-3", label: "Stage 3 · capitulation", dropPct: 30 },
  { id: "stage-4", label: "Stage 4 · trough", dropPct: 10 },
];

export const DEFAULT_SPOT_BTC_USD = 67_000;

export interface LabInputs {
  btcCollateral: number;
  musdDebt: number;
  btcPriceUsd: number;
  liquidationThresholdPct: number;
}

/** Sensible starter position: ~150% collateral ratio at $67k spot. */
export const DEFAULT_LAB: LabInputs = {
  btcCollateral: 0.25,
  musdDebt: 11_165,
  btcPriceUsd: DEFAULT_SPOT_BTC_USD,
  liquidationThresholdPct: 110,
};
