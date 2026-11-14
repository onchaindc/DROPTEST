/**
 * CSV export for the risk pack.
 *
 * One flat table with a `section` column keeps the file usable in a
 * spreadsheet without inventing several schemas: shock rows, timeline
 * stages, breakpoints, and historical replays all share the columns
 * (price, drop, ratio, status, note).
 *
 * Escaping follows RFC 4180: wrap fields containing a comma, quote or
 * newline in double quotes, and double any internal quote.
 */
import type { ScenarioState } from "./engine/risk";

export type CsvValue = string | number | null | undefined;

export function csvEscape(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "number" ? formatNumber(value) : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

export interface BreakpointCsvRow {
  targetRatioPct: number;
  priceUsd: number;
  dropFromSpotPct: number;
  alreadyBreached: boolean;
}

export interface HistoricalCsvRow {
  name: string;
  dropPct: number;
  shockedPriceUsd: number;
  collateralRatio: number;
  liquidated: boolean;
}

export interface LabCsvInput {
  /** ISO timestamp, so an exported file can be tied to a moment. */
  generatedAt: string;
  position: {
    btcCollateral: number;
    musdDebt: number;
    btcPriceUsd: number;
    liquidationThresholdPct: number;
  };
  scenarios?: readonly ScenarioState[];
  timeline?: readonly {
    label: string;
    priceUsd: number;
    cumulativeDropPct: number;
    collateralRatio: number;
    liquidated: boolean;
  }[];
  breakpoints?: readonly BreakpointCsvRow[];
  historical?: readonly HistoricalCsvRow[];
}

export const CSV_HEADER = [
  "section",
  "label",
  "price_usd",
  "drop_pct",
  "collateral_ratio_pct",
  "status",
  "note",
] as const;

/**
 * Build the risk-pack CSV. Every row carries the same columns; empty
 * cells are honest blanks rather than zeros.
 */
export function buildLabCsv(input: LabCsvInput): string {
  const rows: CsvValue[][] = [
    [...CSV_HEADER],
    [
      "position",
      "Entered position",
      input.position.btcPriceUsd,
      "",
      ((input.position.btcCollateral * input.position.btcPriceUsd) /
        input.position.musdDebt) *
        100,
      "",
      `${input.position.btcCollateral} BTC vs ${input.position.musdDebt} MUSD at a ${input.position.liquidationThresholdPct}% threshold`,
    ],
    ["meta", "Generated", "", "", "", "", input.generatedAt],
  ];

  for (const s of input.scenarios ?? []) {
    rows.push([
      "preset_shock",
      s.label,
      s.shockedPriceUsd,
      s.dropPct,
      s.collateralRatio * 100,
      s.liquidated ? "liquidatable" : "survives",
      s.liquidated
        ? "below threshold"
        : `${s.headroomDropPct.toFixed(2)}% further drop available`,
    ]);
  }

  for (const t of input.timeline ?? []) {
    rows.push([
      "timeline_stage",
      t.label,
      t.priceUsd,
      t.cumulativeDropPct,
      t.collateralRatio * 100,
      t.liquidated ? "liquidatable" : "survives",
      "cumulative crash path",
    ]);
  }

  for (const b of input.breakpoints ?? []) {
    rows.push([
      "breakpoint",
      `${b.targetRatioPct}% ratio`,
      b.priceUsd,
      b.dropFromSpotPct,
      b.targetRatioPct,
      b.alreadyBreached ? "already_below" : "above_target",
      "price at which this ratio is reached",
    ]);
  }

  for (const h of input.historical ?? []) {
    rows.push([
      "historical_replay",
      h.name,
      h.shockedPriceUsd,
      h.dropPct,
      h.collateralRatio * 100,
      h.liquidated ? "liquidatable" : "survives",
      "reference drawdown applied once from spot",
    ]);
  }

  return toCsv(rows);
}

/** Filename stamped with the export date, e.g. droptest-risk-2026-11-14.csv. */
export function csvFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `droptest-risk-${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}.csv`;
}
