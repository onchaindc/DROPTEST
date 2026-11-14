import { describe, expect, it } from "vitest";

import {
  encodeScenarioSearch,
  parseScenarioSearch,
  SCENARIO_KEYS,
  THRESHOLD_MAX_PCT,
} from "./share";

const STATE = {
  btcCollateral: 0.25,
  musdDebt: 11_165,
  btcPriceUsd: 67_000,
  liquidationThresholdPct: 110,
};

describe("shareable scenario links", () => {
  it("round-trips a full scenario", () => {
    const search = encodeScenarioSearch({ ...STATE, customDropPct: 50 });
    const parsed = parseScenarioSearch(search);
    expect(parsed).toEqual({ ...STATE, customDropPct: 50 });
  });

  it("round-trips without the optional shock", () => {
    const parsed = parseScenarioSearch(encodeScenarioSearch(STATE));
    expect(parsed).toEqual(STATE);
    expect(parsed?.customDropPct).toBeUndefined();
  });

  it("accepts a leading question mark and comma-grouped numbers", () => {
    const parsed = parseScenarioSearch(
      `?${SCENARIO_KEYS.btcCollateral}=0.25&${SCENARIO_KEYS.musdDebt}=11,165&${SCENARIO_KEYS.btcPriceUsd}=67000&${SCENARIO_KEYS.liquidationThresholdPct}=110`,
    );
    expect(parsed?.musdDebt).toBe(11_165);
  });

  it("returns null when any required field is missing", () => {
    for (const key of Object.values(SCENARIO_KEYS)) {
      if (key === "drop") continue;
      const params = new URLSearchParams(encodeScenarioSearch(STATE));
      params.delete(key);
      expect(parseScenarioSearch(params.toString())).toBeNull();
    }
  });

  it("returns null for out-of-range or unusable values", () => {
    const withParam = (key: string, value: string) => {
      const params = new URLSearchParams(encodeScenarioSearch(STATE));
      params.set(key, value);
      return parseScenarioSearch(params.toString());
    };
    expect(withParam(SCENARIO_KEYS.btcCollateral, "0")).toBeNull();
    expect(withParam(SCENARIO_KEYS.musdDebt, "-5")).toBeNull();
    expect(withParam(SCENARIO_KEYS.btcPriceUsd, "abc")).toBeNull();
    expect(withParam(SCENARIO_KEYS.liquidationThresholdPct, "50")).toBeNull();
    expect(
      withParam(
        SCENARIO_KEYS.liquidationThresholdPct,
        String(THRESHOLD_MAX_PCT + 1),
      ),
    ).toBeNull();
  });

  it("drops an out-of-range optional shock instead of rejecting the link", () => {
    const params = new URLSearchParams(encodeScenarioSearch(STATE));
    params.set(SCENARIO_KEYS.customDropPct, "150");
    const parsed = parseScenarioSearch(params.toString());
    expect(parsed).not.toBeNull();
    expect(parsed?.customDropPct).toBeUndefined();
  });
});
