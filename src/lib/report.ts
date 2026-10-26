import type { LabInputs } from "./engine/scenarios";

/**
 * A self-contained snapshot handed to the printable report page. It
 * stores only numbers and labels the user typed or the engine
 * computed: never wallet data, addresses, or anything personal
 * (DROPTEST has no wallet connection by design).
 */
export interface ReportSnapshot {
  /** ISO timestamp of when the report was created. */
  generatedAt: string;
  origin: "lab" | "studio";
  /** Position inputs the results were recalculated from. */
  inputs: LabInputs;
  /** Lab: the custom shock, in percent drop from spot. */
  customDropPct?: number;
  /** Lab: the editable timeline stage drops in percent. */
  timelineDropsPct?: number[];
  /** Studio: copies of the compared price paths. */
  paths?: {
    name: string;
    stepLabel: string;
    dropPcts: number[];
  }[];
}

export const STORAGE_KEY = "droptest-report-snapshot";

/** Save for the /report page. Storage can fail; the UI treats that as "no". */
export function saveReportSnapshot(snapshot: ReportSnapshot): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadReportSnapshot(): ReportSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeReportSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function isFinitePct(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * Shape-validate a parsed snapshot before any report math runs on it.
 * A corrupted or hand-edited slot must read as null (the honest
 * "no report data" state), never crash the report page.
 */
export function sanitizeReportSnapshot(parsed: unknown): ReportSnapshot | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<ReportSnapshot>;
  if (typeof p.generatedAt !== "string" || Number.isNaN(Date.parse(p.generatedAt))) {
    return null;
  }
  if (p.origin !== "lab" && p.origin !== "studio") return null;
  const i = p.inputs as Partial<ReportSnapshot["inputs"]> | undefined;
  if (
    !i ||
    !isFinitePositive(i.btcCollateral) ||
    !isFinitePositive(i.musdDebt) ||
    !isFinitePositive(i.btcPriceUsd) ||
    !isFinitePositive(i.liquidationThresholdPct) ||
    i.liquidationThresholdPct > 1000
  ) {
    return null;
  }
  const out: ReportSnapshot = {
    generatedAt: p.generatedAt,
    origin: p.origin,
    inputs: {
      btcCollateral: i.btcCollateral,
      musdDebt: i.musdDebt,
      btcPriceUsd: i.btcPriceUsd,
      liquidationThresholdPct: i.liquidationThresholdPct,
    },
  };
  if (isFinitePct(p.customDropPct)) out.customDropPct = p.customDropPct;
  if (
    Array.isArray(p.timelineDropsPct) &&
    p.timelineDropsPct.length > 0 &&
    p.timelineDropsPct.every(isFinitePct)
  ) {
    out.timelineDropsPct = p.timelineDropsPct;
  }
  if (Array.isArray(p.paths) && p.paths.length > 0 && p.paths.length <= 6) {
    const validPaths = p.paths.filter(
      (path) =>
        path &&
        typeof path.name === "string" &&
        typeof path.stepLabel === "string" &&
        Array.isArray(path.dropPcts) &&
        path.dropPcts.length > 0 &&
        path.dropPcts.every(isFinitePct),
    );
    if (validPaths.length > 0) {
      out.paths = validPaths;
    }
  }
  return out;
}

/** Local storage key for Scenario Studio state. Old or broken slots reinitialize. */
export const STUDIO_STORAGE_KEY = "droptest-studio-v1";
