/**
 * Shareable scenario links.
 *
 * The Stress Lab is entirely client-side, so a link is the only way to
 * hand a scenario to someone else (a risk reviewer, a judge, a
 * colleague). Only the four numbers the model needs plus the optional
 * custom shock are encoded: no addresses, no wallet data, nothing about
 * the person who generated the link.
 *
 * Parsing is deliberately strict and range-limited, mirroring the
 * report snapshot sanitizer: a hand-edited or truncated URL must read
 * as "no scenario", never as a partially applied position or a crash in
 * the lab.
 */

export interface ScenarioLinkState {
  btcCollateral: number;
  musdDebt: number;
  btcPriceUsd: number;
  liquidationThresholdPct: number;
  /** Optional custom shock, 0–100. */
  customDropPct?: number;
}

export const SCENARIO_KEYS = {
  btcCollateral: "btc",
  musdDebt: "debt",
  btcPriceUsd: "price",
  liquidationThresholdPct: "thr",
  customDropPct: "drop",
} as const;

export const THRESHOLD_MIN_PCT = 100;
export const THRESHOLD_MAX_PCT = 1000;

function positive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function parsePositive(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  return positive(n) ? n : null;
}

/** Build the query string for a scenario (without the leading "?"). */
export function encodeScenarioSearch(state: ScenarioLinkState): string {
  const params = new URLSearchParams();
  params.set(SCENARIO_KEYS.btcCollateral, String(state.btcCollateral));
  params.set(SCENARIO_KEYS.musdDebt, String(state.musdDebt));
  params.set(SCENARIO_KEYS.btcPriceUsd, String(state.btcPriceUsd));
  params.set(
    SCENARIO_KEYS.liquidationThresholdPct,
    String(state.liquidationThresholdPct),
  );
  if (state.customDropPct !== undefined) {
    params.set(SCENARIO_KEYS.customDropPct, String(state.customDropPct));
  }
  return params.toString();
}

/**
 * Read a scenario out of a location search string. Returns null when
 * the position is incomplete or out of range.
 */
export function parseScenarioSearch(
  search: string,
): ScenarioLinkState | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const btcCollateral = parsePositive(params.get(SCENARIO_KEYS.btcCollateral));
  const musdDebt = parsePositive(params.get(SCENARIO_KEYS.musdDebt));
  const btcPriceUsd = parsePositive(params.get(SCENARIO_KEYS.btcPriceUsd));
  const thresholdRaw = parsePositive(
    params.get(SCENARIO_KEYS.liquidationThresholdPct),
  );
  if (
    btcCollateral === null ||
    musdDebt === null ||
    btcPriceUsd === null ||
    thresholdRaw === null ||
    thresholdRaw < THRESHOLD_MIN_PCT ||
    thresholdRaw > THRESHOLD_MAX_PCT
  ) {
    return null;
  }
  const out: ScenarioLinkState = {
    btcCollateral,
    musdDebt,
    btcPriceUsd,
    liquidationThresholdPct: thresholdRaw,
  };
  const dropRaw = parsePositive(params.get(SCENARIO_KEYS.customDropPct));
  if (
    dropRaw !== null &&
    dropRaw > 0 &&
    dropRaw <= 100 &&
    params.get(SCENARIO_KEYS.customDropPct) !== null
  ) {
    out.customDropPct = dropRaw;
  }
  return out;
}
