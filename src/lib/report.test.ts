import { describe, expect, it } from "vitest";

import { sanitizeReportSnapshot, STUDIO_STORAGE_KEY } from "./report";

/**
 * Regression tests for corrupted report snapshots: a malformed saved
 * report must read as null (the honest "no report data" state), never
 * crash the /report page computing math on it.
 */

const VALID = {
  generatedAt: "2026-10-26T12:00:00.000Z",
  origin: "lab" as const,
  inputs: {
    btcCollateral: 0.25,
    musdDebt: 11165,
    btcPriceUsd: 67000,
    liquidationThresholdPct: 110,
  },
};

describe("sanitizeReportSnapshot", () => {
  it("accepts a valid lab snapshot", () => {
    const out = sanitizeReportSnapshot(VALID);
    expect(out).not.toBeNull();
    expect(out?.inputs.btcCollateral).toBe(0.25);
    expect(out?.origin).toBe("lab");
  });

  it("accepts a valid studio snapshot with paths", () => {
    const out = sanitizeReportSnapshot({
      ...VALID,
      origin: "studio",
      paths: [
        { name: "Slow", stepLabel: "Month", dropPcts: [4, 4, 4] },
      ],
    });
    expect(out?.paths).toHaveLength(1);
    expect(out?.paths?.[0].dropPcts).toEqual([4, 4, 4]);
  });

  it("rejects null and non-object snapshots", () => {
    expect(sanitizeReportSnapshot(null)).toBeNull();
    expect(sanitizeReportSnapshot("hello")).toBeNull();
    expect(sanitizeReportSnapshot(42)).toBeNull();
  });

  // The exact crash previously reproduced in the browser:
  // TypeError: Cannot read properties of null (reading 'btcPriceUsd')
  it("rejects a snapshot whose inputs are null", () => {
    expect(sanitizeReportSnapshot({ ...VALID, inputs: null })).toBeNull();
  });

  it("rejects snapshots with missing or non-numeric input fields", () => {
    for (const field of [
      "btcCollateral",
      "musdDebt",
      "btcPriceUsd",
      "liquidationThresholdPct",
    ] as const) {
      const broken = { ...VALID, inputs: { ...VALID.inputs, [field]: undefined } };
      expect(sanitizeReportSnapshot(broken)).toBeNull();
      const zero = { ...VALID, inputs: { ...VALID.inputs, [field]: 0 } };
      expect(sanitizeReportSnapshot(zero)).toBeNull();
      const stringy = { ...VALID, inputs: { ...VALID.inputs, [field]: "10" } };
      expect(sanitizeReportSnapshot(stringy)).toBeNull();
      const nan = { ...VALID, inputs: { ...VALID.inputs, [field]: Number.NaN } };
      expect(sanitizeReportSnapshot(nan)).toBeNull();
    }
  });

  it("rejects a missing or malformed timestamp and origin", () => {
    expect(sanitizeReportSnapshot({ ...VALID, generatedAt: undefined })).toBeNull();
    expect(sanitizeReportSnapshot({ ...VALID, generatedAt: "not a date" })).toBeNull();
    expect(sanitizeReportSnapshot({ ...VALID, origin: "elsewhere" })).toBeNull();
  });

  it("drops invalid optional timeline stages and keeps valid ones", () => {
    const good = sanitizeReportSnapshot({ ...VALID, timelineDropsPct: [15, 20, 30] });
    expect(good?.timelineDropsPct).toEqual([15, 20, 30]);
    const bad = sanitizeReportSnapshot({ ...VALID, timelineDropsPct: [15, 120] });
    expect(bad?.timelineDropsPct).toBeUndefined();
    const emptish = sanitizeReportSnapshot({ ...VALID, timelineDropsPct: [] });
    expect(emptish?.timelineDropsPct).toBeUndefined();
    const notArray = sanitizeReportSnapshot({ ...VALID, timelineDropsPct: 15 as unknown as number[] });
    expect(notArray?.timelineDropsPct).toBeUndefined();
  });

  it("drops invalid optional custom drop", () => {
    expect(sanitizeReportSnapshot({ ...VALID, customDropPct: 50 })?.customDropPct).toBe(50);
    expect(sanitizeReportSnapshot({ ...VALID, customDropPct: 150 })?.customDropPct).toBeUndefined();
    expect(sanitizeReportSnapshot({ ...VALID, customDropPct: -1 })?.customDropPct).toBeUndefined();
  });

  it("keeps only fully valid paths and drops garbage path entries", () => {
    const out = sanitizeReportSnapshot({
      ...VALID,
      paths: [
        { name: "Good", stepLabel: "Day", dropPcts: [10, 5] },
        { name: "Bad", stepLabel: "Day", dropPcts: [10, "x" as unknown as number] },
        { name: "Also bad", stepLabel: "Day", dropPcts: [] },
        null,
      ],
    });
    expect(out?.paths).toHaveLength(1);
    expect(out?.paths?.[0].name).toBe("Good");
  });

  it("returns null when every path entry is invalid", () => {
    const out = sanitizeReportSnapshot({
      ...VALID,
      paths: [{ name: "Bad", stepLabel: "Day", dropPcts: [400] }],
    });
    expect(out?.paths).toBeUndefined();
    // still usable otherwise
    expect(out?.inputs.btcCollateral).toBe(0.25);
  });

  it("keeps the studio storage key a string constant", () => {
    expect(typeof STUDIO_STORAGE_KEY).toBe("string");
  });
});
