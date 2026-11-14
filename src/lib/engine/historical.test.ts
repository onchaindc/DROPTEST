import { describe, expect, it } from "vitest";

import { HISTORICAL_CRASHES, replayHistoricalCrashes } from "./historical";

const position = {
  btcCollateral: 0.25,
  musdDebt: 11_165,
  btcPriceUsd: 67_000,
  liquidationThresholdPct: 110,
};

describe("replayHistoricalCrashes", () => {
  it("applies each reference drop once from spot", () => {
    const rows = replayHistoricalCrashes(position);
    expect(rows).toHaveLength(HISTORICAL_CRASHES.length);
    const covid = rows.find((r) => r.crash.id === "covid-2020");
    expect(covid?.shockedPriceUsd).toBeCloseTo(33_500, 6);
    expect(covid?.collateralValueUsd).toBeCloseTo(0.25 * 33_500, 6);
    expect(covid?.collateralRatio).toBeCloseTo((0.25 * 33_500) / 11_165, 8);
    expect(covid?.liquidated).toBe(true);
  });

  it("keeps the deepest drawdown below the threshold and marks survivors", () => {
    const rows = replayHistoricalCrashes(position, [
      { id: "mild", name: "Mild", dropPct: 10, period: "test", note: "test" },
      { id: "deep", name: "Deep", dropPct: 60, period: "test", note: "test" },
    ]);
    const mild = rows[0];
    const deep = rows[1];
    expect(mild.liquidated).toBe(false);
    expect(mild.headroomDropPct).toBeCloseTo(
      (1 - 49_126 / 60_300) * 100,
      4,
    );
    expect(deep.liquidated).toBe(true);
    expect(deep.headroomDropPct).toBe(0);
  });

  it("returns an empty list for an unmodellable position", () => {
    expect(
      replayHistoricalCrashes({ ...position, musdDebt: 0 }),
    ).toEqual([]);
  });
});
