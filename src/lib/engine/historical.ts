/**
 * Historical Bitcoin drawdown references.
 *
 * These are educational context only. They are not predictions, not
 * protocol parameters, and not inputs to the risk engine. They exist
 * so a user can ask "how would this position have looked during X?"
 * against real past percentage drops from local peaks or ATHs.
 *
 * Sources are approximate peak-to-trough figures widely cited in
 * market history; exact start/end dates and measurement windows vary.
 */

export interface HistoricalCrash {
  id: string;
  name: string;
  /** Approximate peak-to-trough drop in percent. */
  dropPct: number;
  period: string;
  note: string;
}

export const HISTORICAL_CRASHES: HistoricalCrash[] = [
  {
    id: "covid-2020",
    name: "COVID crash",
    dropPct: 50,
    period: "Feb–Mar 2020",
    note: "Roughly 50% from the early-2020 high in a matter of weeks.",
  },
  {
    id: "may-2021",
    name: "May 2021 drawdown",
    dropPct: 53,
    period: "Apr–Jul 2021",
    note: "From the April 2021 high into the summer low.",
  },
  {
    id: "luna-ftx-2022",
    name: "2022 bear (Luna / FTX)",
    dropPct: 77,
    period: "Nov 2021–Nov 2022",
    note: "Approximate peak-to-trough from the 2021 ATH through the FTX lows.",
  },
  {
    id: "2024-correction",
    name: "2024 mid-cycle dip",
    dropPct: 30,
    period: "2024",
    note: "Illustrative mid-cycle correction magnitude, not a single event.",
  },
];

/**
 * Simple fixed-rate interest projection on MUSD debt.
 *
 * Mezo documents fixed rates in a 1–5% range but does not publish a
 * live rate. This is therefore an explicit user assumption, never a
 * protocol fact. Compounding is simple annual for clarity.
 */
export function projectDebt(params: {
  principal: number;
  annualRatePct: number;
  days: number;
}): number {
  if (params.principal <= 0 || params.days <= 0 || params.annualRatePct < 0) {
    return params.principal;
  }
  const rate = params.annualRatePct / 100;
  const fraction = params.days / 365;
  return params.principal * (1 + rate * fraction);
}

export const INTEREST_HORIZONS = [30, 90, 180] as const;
