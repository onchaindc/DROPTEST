import { describe, expect, it } from "vitest";

import { btc, musd, pct, ratio, usd } from "./format";

describe("usd", () => {
  it("formats ordinary amounts", () => {
    expect(usd(1234.56, 2)).toContain("1,234.56");
    expect(usd(200, 0)).toContain("200");
  });

  it("does not throw for a small value formatted with zero fraction digits", () => {
    // Regression: Intl throws when minimumFractionDigits > maximumFractionDigits.
    expect(() => usd(30, 0)).not.toThrow();
    expect(() => usd(0.5, 0)).not.toThrow();
    expect(usd(30, 0)).toContain("30");
  });

  it("renders non-finite values as a dash", () => {
    expect(usd(Number.NaN)).toBe("-");
    expect(usd(Number.POSITIVE_INFINITY)).toBe("-");
  });
});

describe("other formatters", () => {
  it("formats MUSD with its unit and two decimals", () => {
    expect(musd(11165)).toBe("11,165.00 MUSD");
    expect(musd(200, 0)).toBe("200 MUSD");
    expect(musd(Number.NaN)).toBe("-");
  });

  it("formats BTC, ratios and percentages", () => {
    expect(btc(0.25)).toBe("0.25 BTC");
    expect(ratio(1.5)).toBe("150.0%");
    expect(pct(26.678)).toBe("26.7%");
    expect(ratio(Number.NaN)).toBe("-");
  });
});
