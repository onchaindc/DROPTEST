"use client";

import { useCallback, useMemo, useState } from "react";
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
  }, []);

  const buildSnapshot = useCallback((): ReportSnapshot | null => {
    if (!validInputs) return null;
    return {
      generatedAt: new Date().toISOString(),
      origin: "lab",
      inputs: validInputs,
      customDropPct: customDrop,
      timelineDropsPct: timelineDrops,
    };
  }, [validInputs, customDrop, timelineDrops]);

  const openReport = useCallback(() => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    if (!saveReportSnapshot(snapshot)) return;
    router.push("/report");
  }, [buildSnapshot, router]);

  const timelineAllLiquidated = timelineStates.some((s) => s.liquidated);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Stress Lab
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            A hypothetical BTC/MUSD position under price shocks. Parameters
            follow official Mezo documentation, and nothing you enter here
            touches a live position.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="w-fit rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-surface-strong"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={openReport}
            disabled={!validInputs}
            className="w-fit rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Printable report
          </button>
        </div>
      </div>

      {invalidFields.length > 0 && (
        <div className="mb-8 rounded-sm border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">
          Fix these inputs to recalculate:{" "}
          {invalidFields.map((k) => fieldMeta[k].label).join(", ")} must be
          numbers greater than zero.
        </div>
      )}

      {/* Position inputs */}
      <section className="mb-12 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="border border-hairline bg-surface-strong p-4 sm:p-6">
          <h2 className="mb-1 text-sm font-semibold text-ink">
            Hypothetical position
          </h2>
          <p className="mb-5 text-xs text-ink-faint">
            The three numbers the whole page runs on. Nothing is sent anywhere.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(fieldMeta) as FieldKey[]).map((key) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-soft">
                  {fieldMeta[key].label}
                </span>
                <div
                  className={`flex items-baseline border bg-background px-3 py-2 focus-within:border-ink ${
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
        </div>

        {/* Threshold assumption */}
        <div className="flex flex-col gap-4 border border-hairline bg-surface-strong p-4 sm:p-6">
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

      {/* Charts row */}
      {metrics && validInputs && (
        <section className="mb-12 grid gap-6 lg:grid-cols-2">
          <div className="border border-hairline bg-surface-strong p-4 sm:p-6">
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

          <div className="flex flex-col border border-hairline bg-surface-strong p-4 sm:p-6">
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

      {/* Custom shock + presets */}
      {validInputs && (
        <section className="mb-12 grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="flex flex-col gap-4 border border-hairline bg-surface-strong p-4 sm:p-6">
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
                  className={`tabular w-full border bg-background px-3 py-2 text-sm outline-none focus-within:border-ink ${
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

          <div className="border border-hairline bg-surface-strong p-4 sm:p-6">
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

      {/* Mezo integration */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
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

      {/* Assumptions */}
      <section className="border border-hairline bg-surface-strong p-4 sm:p-6">
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

      {metrics === null && invalidFields.length === 0 && (
        <p className="mt-6 text-sm text-ink-faint">
          Position incomplete. All three inputs must be greater than zero for
          the model to run.
        </p>
      )}
    </main>
  );
}
