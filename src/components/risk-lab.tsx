"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  analyze,
  applyScenarios,
  cumulativePricePath,
  reverseStress,
  InvalidPositionError,
  type ReverseStressResult,
  type ScenarioState,
} from "@/lib/engine/risk";
import {
  DEFAULT_LAB,
  PRESET_SCENARIOS,
  TIMELINE_STAGES,
} from "@/lib/engine/scenarios";
import {
  DOC_CONFLICT_NOTE,
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  DEFAULT_MEZO_NETWORK,
  MEZO_NETWORKS,
  type MezoNetwork,
} from "@/lib/mezo/verified";
import { pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";
import { RatioCurve, ScenarioBars, TimelineChart } from "@/components/charts";
import { MezoOracleBadge } from "@/components/mezo-oracle-badge";
import {
  LivePositionWatch,
  type FilledLivePosition,
} from "@/components/live-position-watch";
import { saveReportSnapshot, type ReportSnapshot } from "@/lib/report";
import type { LabInputs } from "@/lib/engine/scenarios";
import { CostAnalysis } from "@/components/cost-analysis";
import { RescuePanel } from "@/components/rescue-panel";
import { ProtocolHealth } from "@/components/protocol-health";
import { breakpointLadder } from "@/lib/engine/rescue";
import { replayHistoricalCrashes } from "@/lib/engine/historical";
import { buildLabCsv, csvFilename } from "@/lib/export";
import { encodeScenarioSearch, parseScenarioSearch } from "@/lib/share";

type FieldKey = "btcCollateral" | "musdDebt" | "btcPriceUsd";

interface ParsedInputs {
  btcCollateral: number | null;
  musdDebt: number | null;
  btcPriceUsd: number | null;
}

function parseField(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const fieldMeta: Record<FieldKey, {
  label: string;
  suffix: string;
  step: string;
  hint: string;
}> = {
  btcCollateral: {
    label: "BTC collateral",
    suffix: "BTC",
    step: "0.0001",
    hint: "Amount you would lock up",
  },
  musdDebt: {
    label: "MUSD debt (total)",
    suffix: "MUSD",
    step: "100",
    hint: "Supply to borrow against it",
  },
  btcPriceUsd: {
    label: "Spot BTC price",
    suffix: "USD / BTC",
    step: "100",
    hint: "You type this, or sync the oracle",
  },
};

const ASSUMPTIONS = [
  {
    title: "Liquidation threshold: 110% (verified)",
    body: "Mezo's developer guide says a trove can be liquidated when its collateralization ratio \"falls below 110%\". The price at which a position's ratio reaches exactly 110% of its debt is the liquidation price. The slider below 110% is a what-if control, not the documented value.",
    source: "https://mezo.org/docs/developers/musd/",
  },
  {
    title: "Recovery Mode: system TCR below 150% (verified)",
    body: "Recovery Mode is a system-wide trigger based on the total collateral ratio of the whole market, not a per-position liquidation line. One older Mezo blog wrote that loans under 150% \"risk liquidation\", which conflicts with the current guide's single 110% process. The calculator models 110% per position and documents the conflict instead of resolving it silently.",
    source: DOC_CONFLICT_NOTE.source,
  },
  {
    title: "Liquidation outcome (verified)",
    body: "Per the mUSD documentation, the liquidator receives a 0.5% share of the trove's collateral plus 200 MUSD gas compensation. The Stability Pool burns MUSD against the debt and seizes the remaining 99.5%. The calculator therefore shows liquidation returning nothing to the borrower.",
    source: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    title: "Interest and fees (verified range, rate not modelled)",
    body: "Mezo documents a 0.1% governable borrowing charge added to trove debt, and fixed interest whose initial rates ranged from 1% to 5%. The live rate is not published, so your debt figure stays static. Enter the total debt you want to stress; the model does not project future accrual.",
    source: "https://mezo.org/docs/users/borrow/mint-musd/",
  },
  {
    title: "What this tool is not",
    body: "DROPTEST never connects to a wallet and never signs anything: it cannot borrow, repay, or approve. Live reads are strictly read-only: an on-chain BTC/USD price and, on the Stress Lab, an open trove fetched by public address from the TroveManager proxy. All scenario math is client-side, and loaded positions always carry on-chain/calculated labels.",
    source: undefined,
  },
];

const REVERSE_TARGET_MIN_PCT = 100;
const REVERSE_TARGET_MAX_PCT = 500;

type TabId =
  | "position"
  | "stress"
  | "costs"
  | "rescue"
  | "live"
  | "assumptions";

const TABS: { id: TabId; label: string; blurb: string }[] = [
  {
    id: "position",
    label: "Position",
    blurb: "Your three numbers, the threshold, and the headline risk metrics.",
  },
  {
    id: "stress",
    label: "Stress tests",
    blurb:
      "Crash the price: a custom shock, the severity ladder, a staged timeline, reverse stress and ratio charts.",
  },
  {
    id: "costs",
    label: "Costs & interest",
    blurb:
      "Documented fees, interest drag on the liquidation price, the liquidation split, and redemption exposure.",
  },
  {
    id: "rescue",
    label: "Rescue & history",
    blurb:
      "Top up BTC or repay MUSD to survive a chosen crash, breakpoints by ratio, and historical replay.",
  },
  {
    id: "live",
    label: "Live data",
    blurb:
      "Oracle sync, read-only trove lookup by address, and live system health (TCR, MCR, fees).",
  },
  {
    id: "assumptions",
    label: "Method",
    blurb: "What is documented, what is assumed, and where each number comes from.",
  },
];

/** Small inline glyph per section, so the tabs read at a glance. */
function TabGlyph({ id }: { id: TabId }) {
  const svgProps = {
    viewBox: "0 0 20 20",
    "aria-hidden": true,
    className: "h-3.5 w-3.5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "position":
      return (
        <svg {...svgProps}>
          <path d="M3.5 6.5h13M3.5 13.5h13" />
          <circle cx="8" cy="6.5" r="2" />
          <circle cx="13" cy="13.5" r="2" />
        </svg>
      );
    case "stress":
      return (
        <svg {...svgProps}>
          <path d="M11 2.5 4.5 11h4.8l-.8 6.5 6.9-8.5h-4.9l.5-6.5Z" />
        </svg>
      );
    case "costs":
      return (
        <svg {...svgProps}>
          <path d="M5 3.5h10v13l-2.5-1.8-2.5 1.8-2.5-1.8L5 16.5v-13Z" />
          <path d="M8 7.5h4M8 10.5h4" />
        </svg>
      );
    case "rescue":
      return (
        <svg {...svgProps}>
          <path d="M10 2.8 16 5v5c0 3.4-2.4 5.9-6 7.2-3.6-1.3-6-3.8-6-7.2V5l6-2.2Z" />
          <path d="M7.3 9.8 9.2 11.6l3.6-3.8" />
        </svg>
      );
    case "live":
      return (
        <svg {...svgProps}>
          <circle cx="10" cy="13" r="1.6" />
          <path d="M6.4 9.6a5 5 0 0 1 7.2 0M3.9 7a8.6 8.6 0 0 1 12.2 0" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <path d="M4 3.5h7l4 4v9H4v-13Z" />
          <path d="M11 3.5v4h4M7 11h5M7 13.5h5" />
        </svg>
      );
  }
}

function LabTabNav({
  tab,
  onTab,
  className,
}: {
  tab: TabId;
  onTab: (tab: TabId) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Lab sections" className={className}>
      <div
        role="tablist"
        aria-label="Lab sections"
        className="-mx-4 flex flex-wrap gap-1.5 px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-tab={t.id}
            onClick={() => onTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              tab === t.id
                ? "bg-ink font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.18)]"
                : "text-ink-soft hover:bg-surface hover:text-ink"
            }`}
          >
            <TabGlyph id={t.id} />
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        {TABS.find((t) => t.id === tab)?.blurb}
      </p>
    </nav>
  );
}

function SectionMissingState({
  onOpenPosition,
}: {
  onOpenPosition: () => void;
}) {
  return (
    <div className="card p-5 text-sm sm:p-6">
      <p className="font-medium text-ink">This section needs a complete position.</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Switch to the{" "}
        <button
          type="button"
          onClick={onOpenPosition}
          className="text-accent underline underline-offset-2"
        >
          Position
        </button>{" "}
        tab and fill BTC collateral, MUSD debt, and the spot price.
      </p>
    </div>
  );
}

export function RiskLab() {
  const router = useRouter();
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    btcCollateral: String(DEFAULT_LAB.btcCollateral),
    musdDebt: String(DEFAULT_LAB.musdDebt),
    btcPriceUsd: String(DEFAULT_LAB.btcPriceUsd),
  });
  const [threshold, setThreshold] = useState(DEFAULT_LAB.liquidationThresholdPct);
  const [customDrop, setCustomDrop] = useState(50);
  const [timelineDrops, setTimelineDrops] = useState<number[]>(
    TIMELINE_STAGES.map((s) => s.dropPct),
  );
  const [targetRatioInput, setTargetRatioInput] = useState("130");
  const [spotSource, setSpotSource] = useState<"manual" | "oracle">("manual");
  // Mainnet is the production network; testnet stays reachable only
  // through this explicitly labelled selector.
  const [network, setNetwork] = useState<MezoNetwork>(DEFAULT_MEZO_NETWORK);
  // The lab is one stateful engine rendered across tabbed sections, so
  // an input change on one tab updates every other tab instantly.
  const [tab, setTab] = useState<TabId>("position");
  // Cost/interest assumption, rescue sizing, and the share-link status.
  const [aprPct, setAprPct] = useState(3);
  const [liveAprPct, setLiveAprPct] = useState<number | null>(null);
  const [rescueDrop, setRescueDrop] = useState(30);
  const [rescueTarget, setRescueTarget] = useState(150);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const parsed = useMemo<{ fields: ParsedInputs; threshold: number }>(() => ({
    fields: {
      btcCollateral: parseField(fields.btcCollateral),
      musdDebt: parseField(fields.musdDebt),
      btcPriceUsd: parseField(fields.btcPriceUsd),
    },
    threshold,
  }), [fields, threshold]);

  const invalidFields: FieldKey[] = useMemo(() => {
    const missing: FieldKey[] = [];
    if (parsed.fields.btcCollateral === null) missing.push("btcCollateral");
    if (parsed.fields.musdDebt === null) missing.push("musdDebt");
    if (parsed.fields.btcPriceUsd === null) missing.push("btcPriceUsd");
    return missing;
  }, [parsed]);

  const validInputs: LabInputs | null = useMemo(() => {
    if (
      parsed.fields.btcCollateral === null ||
      parsed.fields.musdDebt === null ||
      parsed.fields.btcPriceUsd === null
    ) {
      return null;
    }
    return {
      btcCollateral: parsed.fields.btcCollateral,
      musdDebt: parsed.fields.musdDebt,
      btcPriceUsd: parsed.fields.btcPriceUsd,
      liquidationThresholdPct: threshold,
    };
  }, [parsed, threshold]);

  const metrics = useMemo(() => {
    if (!validInputs) return null;
    try {
      return analyze(validInputs);
    } catch (err) {
      if (err instanceof InvalidPositionError) return null;
      throw err;
    }
  }, [validInputs]);

  const scenarioStates: ScenarioState[] = useMemo(() => {
    if (!validInputs) return [];
    try {
      return applyScenarios(validInputs, PRESET_SCENARIOS);
    } catch (err) {
      if (err instanceof InvalidPositionError) return [];
      throw err;
    }
  }, [validInputs]);

  const customScenario: ScenarioState | null = useMemo(() => {
    if (!validInputs) return null;
    try {
      return applyScenarios(validInputs, [
        { id: "custom", label: `Custom −${customDrop}%`, dropPct: customDrop },
      ])[0];
    } catch (err) {
      if (err instanceof InvalidPositionError) return null;
      throw err;
    }
  }, [validInputs, customDrop]);

  const targetRatio = Number(targetRatioInput.replace(/,/g, ""));
  const reverse: ReverseStressResult | { error: string } | null = useMemo(() => {
    if (!validInputs) return null;
    if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
      return { error: "Enter a collateral ratio greater than zero." };
    }
    try {
      return reverseStress(validInputs, targetRatio);
    } catch (err) {
      if (err instanceof InvalidPositionError) return { error: err.message };
      throw err;
    }
  }, [validInputs, targetRatio]);

  const timelineStages = useMemo(() => {
    if (!validInputs) return [];
    const prices = cumulativePricePath(validInputs.btcPriceUsd, timelineDrops);
    return prices.map((price, i) => ({
      label: `Stage ${i + 1}`,
      priceUsd: price,
      cumulativeDropPct: (1 - price / validInputs.btcPriceUsd) * 100,
    }));
  }, [validInputs, timelineDrops]);

  const timelineStates: ScenarioState[] = useMemo(() => {
    if (!validInputs) return [];
    try {
      return applyScenarios(
        validInputs,
        timelineStages.map((s, i) => ({
          id: `stage-${i + 1}`,
          label: s.label,
          dropPct: s.cumulativeDropPct,
        })),
      );
    } catch (err) {
      if (err instanceof InvalidPositionError) return [];
      throw err;
    }
  }, [validInputs, timelineStages]);

  const setField = useCallback((key: FieldKey, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (key === "btcPriceUsd") {
      setSpotSource("manual");
    }
  }, []);

  /**
   * One-click "borrow to this ratio": debt = collateral value / target.
   * The most common starting question is "how much can I safely borrow?",
   * so the presets answer it without requiring mental algebra.
   */
  const applyTargetRatio = useCallback(
    (targetRatioPct: number) => {
      const btc = parseField(fields.btcCollateral);
      const price = parseField(fields.btcPriceUsd);
      if (btc === null || price === null || targetRatioPct <= 0) return;
      const debt = (btc * price) / (targetRatioPct / 100);
      setFields((prev) => ({
        ...prev,
        musdDebt: String(Math.round(debt * 100) / 100),
      }));
    },
    [fields.btcCollateral, fields.btcPriceUsd],
  );

  const syncFromOracle = useCallback((priceUsd: number) => {
    setField("btcPriceUsd", String(Math.round(priceUsd * 100) / 100));
    setSpotSource("oracle");
  }, [setField]);

  /**
   * Copy a fully loaded live trove into the hypothetical inputs so the
   * existing risk engine and Stress Lab run unchanged on real data.
   * The labels below make clear those three numbers then contain live
   * on-chain values, while every downstream metric is calculated.
   */
  const fillFromLive = useCallback((filled: FilledLivePosition) => {
    setFields({
      btcCollateral: String(Math.round(filled.input.btcCollateral * 1e8) / 1e8),
      musdDebt: String(Math.round(filled.input.musdDebt * 100) / 100),
      btcPriceUsd: String(Math.round(filled.input.btcPriceUsd * 100) / 100),
    });
    setSpotSource("oracle");
    // A live trove carries its own fixed rate; use it for the drag table
    // instead of leaving the user on a generic assumption.
    setLiveAprPct(filled.annualRatePct ?? null);
    if (filled.annualRatePct !== undefined) setAprPct(filled.annualRatePct);
    setTab("position");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const reset = useCallback(() => {
    setFields({
      btcCollateral: String(DEFAULT_LAB.btcCollateral),
      musdDebt: String(DEFAULT_LAB.musdDebt),
      btcPriceUsd: String(DEFAULT_LAB.btcPriceUsd),
    });
    setThreshold(DEFAULT_LAB.liquidationThresholdPct);
    setTimelineDrops(TIMELINE_STAGES.map((s) => s.dropPct));
    setCustomDrop(50);
    setTargetRatioInput("130");
    setSpotSource("manual");
    setAprPct(3);
    setLiveAprPct(null);
    setRescueDrop(30);
    setRescueTarget(150);
    setShareStatus(null);
  }, []);

  const buildSnapshot = useCallback((): ReportSnapshot | null => {
    if (!validInputs) return null;
    return {
      generatedAt: new Date().toISOString(),
      origin: "lab",
      inputs: validInputs,
      customDropPct: customDrop,
      timelineDropsPct: timelineDrops,
      aprPct,
      rescueDropPct: rescueDrop,
      rescueTargetPct: rescueTarget,
      borrowMusd: validInputs.musdDebt,
    };
  }, [validInputs, customDrop, timelineDrops, aprPct, rescueDrop, rescueTarget]);

  const openReport = useCallback(() => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    if (!saveReportSnapshot(snapshot)) return;
    router.push("/report");
  }, [buildSnapshot, router]);

  /** Copy a link that reproduces this exact scenario on open. */
  const copyLink = useCallback(async () => {
    if (!validInputs) return;
    const search = encodeScenarioSearch({
      ...validInputs,
      customDropPct: customDrop,
    });
    const url = `${window.location.origin}${window.location.pathname}?${search}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Scenario link copied to the clipboard.");
    } catch {
      // Clipboard access can be blocked; show the link so it can be copied.
      setShareStatus(url);
    }
  }, [validInputs, customDrop]);

  /** One flat CSV: position, preset shocks, timeline, breakpoints, history. */
  const exportCsv = useCallback(() => {
    if (!validInputs) return;
    const csv = buildLabCsv({
      generatedAt: new Date().toISOString(),
      position: validInputs,
      scenarios: scenarioStates,
      timeline: timelineStates.map((state, i) => ({
        label: timelineStages[i]?.label ?? `Stage ${i + 1}`,
        priceUsd: state.shockedPriceUsd,
        cumulativeDropPct: state.dropPct,
        collateralRatio: state.collateralRatio,
        liquidated: state.liquidated,
      })),
      breakpoints: breakpointLadder(validInputs),
      historical: replayHistoricalCrashes(validInputs).map((row) => ({
        name: row.crash.name,
        dropPct: row.crash.dropPct,
        shockedPriceUsd: row.shockedPriceUsd,
        collateralRatio: row.collateralRatio,
        liquidated: row.liquidated,
      })),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename();
    link.click();
    URL.revokeObjectURL(url);
    setShareStatus(`Exported ${link.download}`);
  }, [validInputs, scenarioStates, timelineStates, timelineStages]);

  // Restore a shared scenario once after mount. Deferred so the first
  // paint matches the server-rendered defaults (no hydration mismatch).
  useEffect(() => {
    const t = setTimeout(() => {
      const linked = parseScenarioSearch(window.location.search);
      if (!linked) return;
      setFields({
        btcCollateral: String(linked.btcCollateral),
        musdDebt: String(linked.musdDebt),
        btcPriceUsd: String(linked.btcPriceUsd),
      });
      setThreshold(linked.liquidationThresholdPct);
      if (linked.customDropPct !== undefined) setCustomDrop(linked.customDropPct);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Clear the share/export confirmation after a few seconds.
  useEffect(() => {
    if (shareStatus === null) return;
    const t = setTimeout(() => setShareStatus(null), 8000);
    return () => clearTimeout(t);
  }, [shareStatus]);

  const timelineAllLiquidated = timelineStates.some((s) => s.liquidated);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Stress Lab</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Where does this position break?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Model a BTC-backed MUSD position, crash the price, and read the exact
            liquidation level and what is left. Hypothetical by default — nothing
            here touches a real loan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyLink()}
            disabled={!validInputs}
            className="btn btn-secondary px-3 py-2 text-[13px]"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!validInputs}
            className="btn btn-secondary px-3 py-2 text-[13px]"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost px-3 py-2 text-[13px]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={openReport}
            disabled={!validInputs}
            className="btn btn-primary order-first px-3.5 py-2 text-[13px] sm:order-none"
          >
            Printable report
          </button>
        </div>
      </div>

      {shareStatus !== null && (
        <p className="mb-6 break-all rounded-sm border border-hairline bg-surface-strong px-3 py-2 text-xs text-ink-soft">
          {shareStatus.startsWith("http") ? (
            <>
              Clipboard unavailable. Copy this link:{" "}
              <code className="tabular text-ink">{shareStatus}</code>
            </>
          ) : (
            shareStatus
          )}
        </p>
      )}

      {metrics && validInputs && (
        <section className="card mb-6 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 p-4 sm:p-5">
            <div className="min-w-0">
              <p className="eyebrow">Position health</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular text-3xl font-semibold tracking-tight text-ink">
                  {fmtRatio(metrics.collateralRatio)}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${
                    metrics.collateralRatio < threshold / 100
                      ? "border-risk/30 bg-risk/5 text-risk"
                      : metrics.collateralRatio < (threshold * 1.25) / 100
                        ? "border-amber/30 bg-amber/5 text-amber"
                        : "border-accent/30 bg-accent/5 text-accent"
                  }`}
                >
                  {metrics.collateralRatio < threshold / 100
                    ? "Liquidatable"
                    : metrics.collateralRatio < (threshold * 1.25) / 100
                      ? "Thin buffer"
                      : "Healthy"}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-soft">
                {metrics.dropToLiquidationPct > 0 ? (
                  <>
                    A {fmtPct(metrics.dropToLiquidationPct)} fall in BTC — to{" "}
                    <span className="tabular text-ink">
                      {usd(metrics.liquidationPriceUsd, 0)}
                    </span>{" "}
                    — puts this position below the {threshold}% line.
                  </>
                ) : (
                  <>
                    Already below the {threshold}% line at this price. Add
                    collateral or repay debt to get back above it.
                  </>
                )}{" "}
                {spotSource === "oracle" ? "Price synced from the Mezo oracle." : "Price entered by hand."}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-2">
              {[
                ["Collateral", usd(metrics.collateralValueUsd, 0)],
                ["Debt", usd(validInputs.musdDebt, 0)],
                ["Liquidation", usd(metrics.liquidationPriceUsd, 0)],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="text-[10px] uppercase tracking-widest text-ink-faint">{term}</dt>
                  <dd className="tabular mt-0.5 text-sm font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="h-1.5 w-full bg-surface-soft" aria-hidden>
            <div
              className={`h-full transition-[width] duration-300 ${
                metrics.collateralRatio < threshold / 100
                  ? "bg-risk"
                  : metrics.collateralRatio < (threshold * 1.25) / 100
                    ? "bg-amber"
                    : "bg-accent"
              }`}
              style={{
                width: `${Math.min(100, (metrics.collateralRatio * 100) / 2.5)}%`,
              }}
            />
          </div>
        </section>
      )}

      <LabTabNav tab={tab} onTab={setTab} className="mb-6 w-full max-w-4xl" />

      {tab === "position" && invalidFields.length > 0 && (
        <div className="mb-8 rounded-sm border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">
          Fix these inputs to recalculate:{" "}
          {invalidFields.map((k) => fieldMeta[k].label).join(", ")} must be
          numbers greater than zero.
        </div>
      )}

      {tab === "position" && (
        <section className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="card p-4 sm:p-6">
          <h2 className="mb-1 text-sm font-semibold text-ink">
            Hypothetical position
          </h2>
          <p className="mb-4 text-xs text-ink-faint">
            The three numbers the whole page runs on. Nothing is sent anywhere.
          </p>
          <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-accent-ink">
            <span className="font-semibold">Not sure where to start?</span>
            <span>
              Keep the sample, or use the ratio presets below the inputs — then
              open <span className="font-medium">Stress tests</span>.
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(fieldMeta) as FieldKey[]).map((key) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-soft">
                  {fieldMeta[key].label}
                </span>
                <div
                  className={`flex items-baseline rounded-lg border bg-background px-3 py-2 transition-shadow focus-within:border-ink focus-within:ring-2 focus-within:ring-accent/15 ${
                    parsed.fields[key] === null ? "border-amber/60" : "border-hairline"
                  }`}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={fieldMeta[key].step}
                    value={fields[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    className="tabular w-full bg-transparent text-sm outline-none"
                    aria-label={fieldMeta[key].label}
                  />
                  <span className="ml-2 shrink-0 text-[11px] text-ink-faint">
                    {fieldMeta[key].suffix}
                  </span>
                </div>
                <span className="text-[11px] text-ink-faint">
                  {fieldMeta[key].hint}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Spot price:
            {spotSource === "oracle"
              ? ` last synced from the ${network.label.split(" (")[0]} oracle`
              : " entered by hand"}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              Borrow to a ratio
            </span>
            {[110, 125, 150, 200, 300].map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => applyTargetRatio(target)}
                className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] tabular text-ink-soft transition-colors hover:border-ink hover:text-ink"
                title={
                  target === 110
                    ? "Borrow the maximum at the documented liquidation line"
                    : `Set debt so the collateral ratio is ${target}%`
                }
              >
                {target === 110 ? "Max · 110%" : `${target}%`}
              </button>
            ))}
          </div>

          {metrics && validInputs && (
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden border bg-hairline sm:grid-cols-5">
              {[
                ["Collateral value", usd(metrics.collateralValueUsd, 0), "Right now"],
                ["Collateral ratio", fmtRatio(metrics.collateralRatio), "Collateral value / debt"],
                ["LTV", fmtRatio(metrics.ltv), "Debt / collateral value"],
                ["Liquidation price", usd(metrics.liquidationPriceUsd, 0), `At ${threshold}% ratio`],
                ["Drop to liquidation", fmtPct(metrics.dropToLiquidationPct), "From current spot"],
              ].map(([term, value, hint]) => (
                <div key={term} className="bg-surface-strong px-3 py-3">
                  <dt className="text-[10px] uppercase tracking-widest text-ink-faint">
                    {term}
                  </dt>
                  <dd className="tabular mt-1 text-sm font-medium text-ink">{value}</dd>
                  <p className="mt-0.5 text-[10px] text-ink-faint">{hint}</p>
                </div>
              ))}
            </dl>
          )}

          {metrics && validInputs && (
            <details className="mt-4 border-t border-hairline pt-3">
              <summary className="cursor-pointer text-[11px] font-medium text-ink-soft">
                What these numbers mean
              </summary>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-soft">
                <li>
                  <span className="font-medium text-ink">Collateral ratio</span> —{" "}
                  what your BTC is worth divided by what you owe. Under {threshold}% the
                  position can be liquidated.
                </li>
                <li>
                  <span className="font-medium text-ink">LTV</span> — the same thing
                  upside down: debt divided by collateral value.
                </li>
                <li>
                  <span className="font-medium text-ink">Liquidation price</span> —{" "}
                  the BTC price where the ratio lands exactly on the threshold.
                </li>
                <li>
                  <span className="font-medium text-ink">Drop to liquidation</span> —{" "}
                  how far BTC has to fall from here to reach that price.
                </li>
              </ul>
            </details>
          )}
        </div>

        {/* Threshold assumption */}
        <div className="card flex flex-col gap-4 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-ink">
            Threshold you can change
          </h2>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
              Liquidation threshold
              <span className="tabular text-sm font-semibold text-ink">
                {threshold}%
              </span>
            </span>
            <input
              type="range"
              min={100}
              max={200}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="accent-ink"
              aria-label="Liquidation threshold in percent"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            The default {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% is{" "}
            <span className="border border-accent/30 bg-accent/5 px-1 text-accent">
              verified
            </span>{" "}
            in Mezo documentation: individual troves are liquidatable when
            their ratio falls below it. Move the slider to explore other
            values; the charts update to whatever you choose.
          </p>
          {metrics && validInputs && (
            <p className="border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
              At the documented {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%
              threshold this position would liquidate at{" "}
              <span className="tabular text-ink">
                {usd(
                  (validInputs.musdDebt *
                    INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT) /
                    (100 * validInputs.btcCollateral),
                  0,
                )}
              </span>
              <span className="no-print">. The chart and the reverse stress tool follow your selected threshold.</span>
            </p>
          )}
        </div>
        </section>
      )}

      {tab === "position" && validInputs && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-hairline bg-surface px-4 py-3">
          <p className="text-xs text-ink-soft">
            Next: find out how far BTC can fall before this position is liquidatable.
          </p>
          <button
            type="button"
            onClick={() => setTab("stress")}
            className="btn btn-primary px-3 py-1.5 text-xs"
          >
            Stress this position →
          </button>
        </div>
      )}

      {tab === "stress" && metrics && validInputs && (
        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="card p-4 sm:p-6">
            <h2 className="mb-1 text-sm font-semibold text-ink">
              Collateral ratio vs BTC price
            </h2>
            <p className="mb-4 text-xs leading-relaxed text-ink-soft">
              Ratio rises with price. The dashed line is your {threshold}%
              threshold, and the dot marks where this position reaches it at{" "}
              {usd(metrics.liquidationPriceUsd, 0)}. Left of the dot the
              position is liquidatable.
            </p>
            <RatioCurve
              btcCollateral={validInputs.btcCollateral}
              musdDebt={validInputs.musdDebt}
              spotPriceUsd={validInputs.btcPriceUsd}
              liquidationPriceUsd={metrics.liquidationPriceUsd}
              liquidationThresholdPct={threshold}
            />
          </div>

          <div className="card flex flex-col p-4 sm:p-6">
            <div>
              <h2 className="mb-1 text-sm font-semibold text-ink">
                Staged crash timeline
              </h2>
              <p className="mb-4 text-xs leading-relaxed text-ink-soft">
                One crash, stage by stage. Each stage compounds on the last,
                so the ratio line only moves further down. Red dots mark
                stages below the threshold. Click a stage chip to remove it.
              </p>
              <TimelineChart
                btcCollateral={validInputs.btcCollateral}
                musdDebt={validInputs.musdDebt}
                spotPriceUsd={validInputs.btcPriceUsd}
                stages={timelineStages}
                liquidationThresholdPct={threshold}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {timelineStages.map((s, i) => {
                const st = timelineStates[i];
                return (
                  <button
                    key={`${s.label}-${i}`}
                    type="button"
                    onClick={() =>
                      setTimelineDrops((prev) => prev.filter((_, j) => j !== i))
                    }
                    title="Remove this stage"
                    className={`rounded-sm border px-2 py-1 text-[11px] tabular transition-colors ${
                      st.liquidated
                        ? "border-risk/40 bg-risk/5 text-risk"
                        : "border-hairline bg-background text-ink-soft hover:border-ink"
                    }`}
                  >
                    Stage {i + 1} · −{s.cumulativeDropPct.toFixed(0)}% total ·{" "}
                    {fmtRatio(st.collateralRatio)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTimelineDrops((prev) => [...prev, customDrop])}
                className="rounded-sm border border-dashed border-hairline px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-ink"
              >
                + add shock of −{customDrop}%
              </button>
            </div>
            {timelineAllLiquidated && (
              <p className="mt-3 text-xs text-risk">
                This path liquidates the position: at least one stage ends
                below the {threshold}% threshold.
              </p>
            )}
          </div>
        </section>
      )}

      {tab === "stress" && validInputs && (
        <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="card flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-ink">One custom shock</h2>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
                Price drop
                <span className="tabular text-sm font-semibold text-ink">
                  −{customDrop}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={customDrop}
                onChange={(e) => setCustomDrop(Number(e.target.value))}
                className="accent-ink"
                aria-label="Custom price drop percent"
              />
            </label>
            {customScenario && (
              <div className="border border-hairline bg-background px-3 py-3 text-sm">
                <p className="flex items-baseline justify-between">
                  <span className="text-ink-faint">Price after the drop</span>
                  <span className="tabular text-ink">
                    {usd(customScenario.shockedPriceUsd, 0)}
                  </span>
                </p>
                <p className="mt-1 flex items-baseline justify-between">
                  <span className="text-ink-faint">Collateral ratio</span>
                  <span
                    className={`tabular font-medium ${
                      customScenario.liquidated ? "text-risk" : "text-ink"
                    }`}
                  >
                    {fmtRatio(customScenario.collateralRatio)}
                  </span>
                </p>
                <p className="mt-1.5 text-xs">
                  {customScenario.liquidated ? (
                    <span className="text-risk">
                      Below the {threshold}% threshold. Liquidatable.
                    </span>
                  ) : (
                    <span className="text-accent">
                      Survives, and can absorb another{" "}
                      {fmtPct(customScenario.headroomDropPct)} before
                      liquidation.
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Reverse stress test */}
            <div className="border-t border-hairline pt-4">
              <h2 className="text-sm font-semibold text-ink">
                Reverse stress test
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                Pick a collateral ratio and read the price that would put you
                there. This is your own what-if threshold, not Mezo&apos;s
                documented {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% liquidation
                threshold.
              </p>
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
                  Target collateral ratio
                  <span
                    className={`tabular ${
                      targetRatio > 0 && Number.isFinite(targetRatio)
                        ? "text-sm font-semibold text-ink"
                        : "text-ink-faint"
                    }`}
                  >
                    {targetRatioInput !== "" && Number.isFinite(targetRatio)
                      ? `${targetRatio}%`
                      : "-"}
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={REVERSE_TARGET_MIN_PCT}
                  max={REVERSE_TARGET_MAX_PCT}
                  step={1}
                  value={targetRatioInput}
                  onChange={(e) => setTargetRatioInput(e.target.value)}
                  className={`tabular w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-within:border-ink focus-within:ring-2 focus-within:ring-accent/15 ${
                    reverse !== null && "error" in reverse
                      ? "border-risk/60"
                      : "border-hairline"
                  }`}
                  aria-label="Target collateral ratio in percent"
                />
              </label>
              {reverse === null ? (
                <p className="mt-2 text-[11px] text-ink-faint">
                  Enter a valid position above to run the reverse test.
                </p>
              ) : "error" in reverse ? (
                <p className="mt-2 text-[11px] text-risk">{reverse.error}</p>
              ) : reverse.alreadyBreached ? (
                <div className="mt-3 border border-amber/40 bg-amber/5 px-3 py-3 text-xs">
                  <p className="text-amber">
                    Your position is already below {reverse.targetRatioPct}%
                    at the current spot price. It would need a higher BTC
                    price of about{" "}
                    <span className="tabular">
                      {usd(reverse.priceUsd, 0)}
                    </span>{" "}
                    to reach that ratio.
                  </p>
                </div>
              ) : (
                <div className="mt-3 border border-hairline bg-background px-3 py-3 text-xs">
                  <p className="flex items-baseline justify-between">
                    <span className="text-ink-faint">
                      BTC price at {reverse.targetRatioPct}% ratio
                    </span>
                    <span className="tabular font-medium text-ink">
                      {usd(reverse.priceUsd, 0)}
                    </span>
                  </p>
                  <p className="mt-1 flex items-baseline justify-between">
                    <span className="text-ink-faint">Drop from spot</span>
                    <span className="tabular font-medium text-ink">
                      −{fmtPct(reverse.dropFromSpotPct)}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    User-selected threshold. Mezo&apos;s documented
                    liquidation threshold is{" "}
                    {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="card p-4 sm:p-6">
            <h2 className="mb-1 text-sm font-semibold text-ink">
              Preset shocks
            </h2>
            <p className="mb-4 text-xs text-ink-soft">
              Severity ladder from a mild rotation to a tail event. Bars under
              the dashed threshold line are liquidatable.
            </p>
            <ScenarioBars scenarios={scenarioStates} liquidationThresholdPct={threshold} />
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline text-sm">
              {scenarioStates.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-ink-soft">
                    {s.label} <span className="tabular text-xs">−{s.dropPct}%</span>
                  </span>
                  <span className="flex items-baseline gap-4">
                    <span className="tabular text-xs text-ink-faint">
                      {usd(s.shockedPriceUsd, 0)}
                    </span>
                    <span
                      className={`tabular w-14 text-right font-medium ${
                        s.liquidated ? "text-risk" : "text-ink"
                      }`}
                    >
                      {fmtRatio(s.collateralRatio)}
                    </span>
                    <span
                      className={`w-24 text-right text-xs ${
                        s.liquidated ? "text-risk" : "text-ink-faint"
                      }`}
                    >
                      {s.liquidated ? "Liquidatable" : `+${fmtPct(s.headroomDropPct)} left`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tab === "stress" && !validInputs && (
        <SectionMissingState onOpenPosition={() => setTab("position")} />
      )}

      {tab === "costs" && validInputs && (
        <CostAnalysis
          inputs={validInputs}
          aprPct={aprPct}
          onAprChange={setAprPct}
          liveAprSource={
            liveAprPct !== null
              ? `the loaded trove (${liveAprPct.toFixed(2)}% fixed on-chain)`
              : null
          }
        />
      )}

      {tab === "costs" && !validInputs && (
        <SectionMissingState onOpenPosition={() => setTab("position")} />
      )}

      {tab === "rescue" && validInputs && (
        <RescuePanel
          inputs={validInputs}
          shockDropPct={rescueDrop}
          onShockChange={setRescueDrop}
          targetRatioPct={rescueTarget}
          onTargetChange={setRescueTarget}
          onExportCsv={exportCsv}
        />
      )}

      {tab === "rescue" && !validInputs && (
        <SectionMissingState onOpenPosition={() => setTab("position")} />
      )}

      {tab === "live" && (
        <section className="card p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="mb-1 text-sm font-semibold text-ink">
              Live Mezo reads, read-only
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-ink-soft">
              Two live read flows, both strictly read-only: the documented Skip
              BTC/USD oracle, and a trove lookup by public address on the
              TroveManager proxy. On success the price input takes the oracle
              value and the page labels it as an oracle reading. If a call
              fails or the connected chain id does not match, the tool says so
              and invents nothing.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-ink-faint">
              Network
            </span>
            <select
              value={network.id}
              onChange={(e) => {
                const next = MEZO_NETWORKS.find((n) => n.id === e.target.value);
                if (next) setNetwork(next);
              }}
              className="rounded-sm border border-hairline bg-background px-2 py-1.5 text-xs text-ink outline-none focus-within:border-ink"
              aria-label="Mezo network for live reads"
            >
              {MEZO_NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <MezoOracleBadge network={network} onPrice={syncFromOracle} />
          <LivePositionWatch network={network} onFill={fillFromLive} />
        </div>
        <div className="mt-4">
          <ProtocolHealth network={network} />
        </div>
        <div className="flex flex-col gap-3 border border-hairline bg-background p-3 text-xs leading-relaxed text-ink-faint">
            <p>
              Network: {network.label}, chain id{" "}
              <code className="tabular">{network.chainId}</code>, RPC{" "}
              <code className="break-all">{network.rpc}</code>. Values from
              Mezo&apos;s official developer docs, verified live before use.
            </p>
            <p className="mt-2">
              MUSD:{" "}
              <code className="break-all tabular">{network.contracts.musd}</code>{" "}
              (18 decimals).{" "}
              <a
                href={network.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Explorer
              </a>
              .
            </p>
            <p className="mt-2">
              No wallet connection, no transaction signing, no borrowing, no
              repayment, no approvals. Everything here is read-only by design;
              the position you load simply replaces the three hypothetical
              inputs and every downstream number stays calculated.
            </p>
        </div>
      </section>
      )}

      {tab === "assumptions" && (
        <section className="card p-4 sm:p-6">
        <h2 className="mb-1 text-sm font-semibold text-ink">
          Assumptions and sources
        </h2>
        <p className="mb-5 text-xs text-ink-soft">
          What is documented, what is assumed, and where each number comes
          from. The fuller write-up lives in{" "}
          <Link href="/method" className="text-accent underline underline-offset-2">
            Research & Methodology
          </Link>
          .
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {ASSUMPTIONS.map((a) => (
            <div key={a.title} className="border-t border-hairline pt-3">
              <h3 className="text-sm font-medium text-ink">{a.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{a.body}</p>
              {a.source && (
                <a
                  href={a.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] text-accent underline underline-offset-2"
                >
                  {a.source.replace("https://", "")}
                </a>
              )}
            </div>
          ))}
        </div>
        </section>
      )}

      {tab === "position" && metrics === null && invalidFields.length === 0 && (
        <p className="text-sm text-ink-faint">
          Position incomplete. All three inputs must be greater than zero for
          the model to run.
        </p>
      )}
    </main>
  );
}
