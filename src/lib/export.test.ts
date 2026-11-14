import { describe, expect, it } from "vitest";

import { buildLabCsv, CSV_HEADER, csvEscape, csvFilename, toCsv } from "./export";

describe("csvEscape", () => {
  it("leaves plain values alone", () => {
    expect(csvEscape("Shock")).toBe("Shock");
    expect(csvEscape(50)).toBe("50");
    expect(csvEscape(1.5)).toBe("1.5");
  });

  it("quotes commas, quotes and newlines per RFC 4180", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
  });

  it("renders null/undefined as empty cells and trims float noise", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(1.50022449)).toBe("1.500224");
    expect(csvEscape(Number.NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins rows with newlines and ends with one", () => {
    const csv = toCsv([
      ["a", "b"],
      [1, 2],
    ]);
    expect(csv).toBe("a,b\n1,2\n");
  });
});

describe("buildLabCsv", () => {
  it("emits a header plus one row per section", () => {
    const csv = buildLabCsv({
      generatedAt: "2026-11-14T00:00:00.000Z",
      position: {
        btcCollateral: 0.25,
        musdDebt: 11_165,
        btcPriceUsd: 67_000,
        liquidationThresholdPct: 110,
      },
      scenarios: [
        {
          id: "correction",
          label: "Correction",
          dropPct: 25,
          shockedPriceUsd: 50_250,
          collateralValueUsd: 12_562.5,
          collateralRatio: 1.1251,
          ltv: 0.8888,
          liquidated: false,
          headroomDropPct: 2.2,
        },
      ],
      timeline: [
        {
          label: "Stage 1",
          priceUsd: 56_950,
          cumulativeDropPct: 15,
          collateralRatio: 1.2753,
          liquidated: false,
        },
      ],
      breakpoints: [
        {
          targetRatioPct: 110,
          priceUsd: 49_126,
          dropFromSpotPct: 26.68,
          alreadyBreached: false,
        },
      ],
      historical: [
        {
          name: "COVID crash",
          dropPct: 50,
          shockedPriceUsd: 33_500,
          collateralRatio: 0.7502,
          liquidated: true,
        },
      ],
    });
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(csv).toContain("position,");
    expect(csv).toContain("preset_shock,Correction");
    expect(csv).toContain("timeline_stage,Stage 1");
    expect(csv).toContain("breakpoint,110% ratio");
    expect(csv).toContain("historical_replay,COVID crash");
    expect(csv).toContain("2026-11-14T00:00:00.000Z");
    expect(lines).toHaveLength(1 + 2 + 4);
  });

  it("works with only a position", () => {
    const csv = buildLabCsv({
      generatedAt: "2026-11-14T00:00:00.000Z",
      position: {
        btcCollateral: 1,
        musdDebt: 10_000,
        btcPriceUsd: 20_000,
        liquidationThresholdPct: 110,
      },
    });
    expect(csv.trimEnd().split("\n")).toHaveLength(3);
  });
});

describe("csvFilename", () => {
  it("stamps the UTC date", () => {
    expect(csvFilename(new Date("2026-11-14T23:59:00Z"))).toBe(
      "droptest-risk-2026-11-14.csv",
    );
  });
});
