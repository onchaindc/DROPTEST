"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import {
  analyze,
  applyScenarios,
  cumulativePricePath,
  InvalidPositionError,
  type ScenarioState,
} from "@/lib/engine/risk";
import {
  DEFAULT_LAB,
  PRESET_SCENARIOS,
  TIMELINE_STAGES,
} from "@/lib/engine/scenarios";
import { DOC_CONFLICT_NOTE, INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT, MEZO_TESTNET } from "@/lib/mezo/verified";
import { btc as fmtBtc, pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";
import { RatioCurve, ScenarioBars, TimelineChart } from "@/components/charts";
import { MezoOracleBadge } from "@/components/mezo-oracle-badge";

type FieldKey = "btcCollateral" | "musdDebt" | "btcPriceUsd";

interface ParsedInputs {
  btcCollateral: number | null;
  musdDebt: number | null;
  btcPriceUsd: number | null;
  liquidationThresholdPct: number;
}

function parseField(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const fieldMeta: Record<FieldKey, { label: string; suffix: string; step: string }> = {
  btcCollateral: { label: "BTC collateral", suffix: "BTC", step: "0.0001" },
  musdDebt: { label: "MUSD debt (total)", suffix: "MUSD", step: "100" },
  btcPriceUsd: { label: "Spot BTC price", suffix: "USD / BTC", step: "100" },
};

/**
 * Verified-parameter callout rows; quotes cite the documentation they
 * were pulled from. Nothing here is adjustable "fact" — the only
 * engine input the user can tune is the threshold, marked as
 * verified-but-explorable.
 */
const ASSUMPTIONS = [
  {
    title: "Liquidation threshold — 110% (verified)",
    body: "Mezo's developer guide: \"When a trove's collateralization ratio falls below 110%, it can be liquidated by anyone.\" The price at which a position's ratio reaches exactly 110% of its debt is the liquidation price. You can drag the threshold below to explore what-if values, but 110% is the documented number.",
    source: "https://mezo.org/docs/developers/musd/",
  },
  {
    title: "Recovery Mode — system TCR below 150% (verified)",
    body: "150% is a system-wide total-collateral-ratio trigger, not a per-position liquidation line. One older Mezo blog wrote that loans under 150% \"risk liquidation\" — a conflict with the current guide's single-process liquidation. We do not resolve that silently: the calculator models 110% per position and keeps Recovery Mode as system context.",
    source: DOC_CONFLICT_NOTE.source,
  },
  {
    title: "Liquidation outcome (verified)",
    body: "\"The liquidator is rewarded with a gas compensation and a percentage of the trove's collateral\" — $200 MUSD plus 0.5% of collateral; the Stability Pool burns MUSD against the debt and seizes the remaining 99.5%. The calculator therefore shows liquidation reclaiming no residual collateral for the borrower.",
    source: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    title: "Interest & fees (verified range, rate not modelled)",
    body: "Mezo docs state a 0.1% governable borrowing charge added to trove debt, and fixed interest whose initial rates ranged 1–5%. The current rate is not published in the documentation, so DROPTEST keeps your debt figure static — enter the total debt you wish to stress rather than modelling future accrual.",
    source: "https://mezo.org/docs/users/borrow/mint-musd/",
  },
  {
    title: "What this tool is not",
    body: "DROPTEST simulates hypothetical positions only. It never connects to a wallet, never reads live user troves, and produces no signed transactions. The one live integration is a read-only BTC/USD price call to Mezo testnet's documented Skip oracle.",
  },
];

export function RiskLab() {
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

  const parsed: ParsedInputs = useMemo(
    () => ({
      btcCollateral: parseField(fields.btcCollateral),
      musdDebt: parseField(fields.musdDebt),
      btcPriceUsd: parseField(fields.btcPriceUsd),
      liquidationThresholdPct: threshold,
    }),
    [fields, threshold],
  );

  const invalidFields = (Object.keys(parsed) as FieldKey[]).filter(
    (k) => parsed[k] === null,
  );

  const validInputs = useMemo(() => {
    if (parsed.btcCollateral === null || parsed.musdDebt === null || parsed.btcPriceUsd === null) {
      return null;
    }
    return {
      btcCollateral: parsed.btcCollateral,
      musdDebt: parsed.musdDebt,
      btcPriceUsd: parsed.btcPriceUsd,
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

  const timelineStages = useMemo(() => {
    if (!validInputs) return [];
    const prices = cumulativePricePath(validInputs.btcPriceUsd, timelineDrops);
    let cumulative = 0;
    return prices.map((price, i) => {
      cumulative += timelineDrops[i];
      return {
        label: `Stage ${i + 1} · −${cumulative.toFixed(0)}% cumulative`,
        priceUsd: price,
        cumulativeDropPct: cumulative,
      };
    });
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
  }, []);

  const syncFromOracle = useCallback(
    (priceUsd: number) => {
      setField("btcPriceUsd", String(Math.round(priceUsd * 100) / 100));
    },
    [setField],
  );

  const reset = useCallback(() => {
    setFields({
      btcCollateral: String(DEFAULT_LAB.btcCollateral),
      musdDebt: String(DEFAULT_LAB.musdDebt),
      btcPriceUsd: String(DEFAULT_LAB.btcPriceUsd),
    });
    setThreshold(DEFAULT_LAB.liquidationThresholdPct);
    setTimelineDrops(TIMELINE_STAGES.map((s) => s.dropPct));
  }, []);

  const timelineAllLiquidated = timelineStates.some((s) => s.liquidated);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Risk lab</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
            Hypothetical BTC/MUSD position under price shock scenarios.
            Parameters follow official Mezo documentation; nothing you enter
            here touches a live position.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="w-fit rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-surface-strong"
        >
          Reset to starter position
        </button>
      </div>

      {invalidFields.length > 0 && (
        <div className="mb-6 rounded-sm border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">
          Fix these inputs to recalculate:{" "}
          {invalidFields.map((k) => fieldMeta[k].label).join(", ")} must be numbers greater
          than zero.
        </div>
      )}

      {/* Position inputs */}
      <section className="mb-10 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
            Hypothetical position
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(fieldMeta) as FieldKey[]).map((key) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-soft">
                  {fieldMeta[key].label}
                </span>
                <div className="flex items-baseline rounded-sm border border-hairline bg-background px-3 py-2 focus-within:border-ink">
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
              </label>
            ))}
          </div>

          {metrics && validInputs && (
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-hairline bg-hairline sm:grid-cols-5">
              {[
                ["Collateral value", usd(metrics.collateralValueUsd, 0)],
                ["Collateral ratio", fmtRatio(metrics.collateralRatio)],
                ["LTV", fmtRatio(metrics.ltv)],
                ["Liquidation price", usd(metrics.liquidationPriceUsd, 0)],
                ["Drop to liquidation", fmtPct(metrics.dropToLiquidationPct)],
              ].map(([term, value]) => (
                <div key={term} className="bg-surface-strong px-3 py-3">
                  <dt className="text-[10px] uppercase tracking-widest text-ink-faint">
                    {term}
                  </dt>
                  <dd className="tabular mt-1 text-sm font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Assumption: threshold */}
        <div className="flex flex-col gap-4 rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
            Assumption you can tune
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
            Default {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% is{" "}
            <span className="rounded-sm border border-accent/30 bg-accent/5 px-1 text-accent">
              verified
            </span>{" "}
            from Mezo docs — individual troves are liquidatable when their ratio
            falls below it. Adjust to explore what-ifs only.
          </p>
        </div>
      </section>

      {/* Charts row */}
      {metrics && validInputs && (
        <section className="mb-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
              Collateral ratio vs BTC price
            </h2>
            <p className="mb-3 text-xs text-ink-soft">
              The dot marks where this position hits its {threshold}% threshold
              at {usd(metrics.liquidationPriceUsd, 0)}.
            </p>
            <RatioCurve
              btcCollateral={validInputs.btcCollateral}
              musdDebt={validInputs.musdDebt}
              spotPriceUsd={validInputs.btcPriceUsd}
              liquidationPriceUsd={metrics.liquidationPriceUsd}
              liquidationThresholdPct={threshold}
            />
          </div>

          <div className="flex flex-col gap-4 rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
            <div>
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
                Scenario timeline
              </h2>
              <p className="mb-3 text-xs text-ink-soft">
                One crash path, stage by stage. Stages compound — each price is
                the previous cumulatively drawn down.
              </p>
              <TimelineChart
                btcCollateral={validInputs.btcCollateral}
                musdDebt={validInputs.musdDebt}
                spotPriceUsd={validInputs.btcPriceUsd}
                stages={timelineStages}
                liquidationThresholdPct={threshold}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {timelineStages.map((s, i) => {
                const st = timelineStates[i];
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() =>
                      setTimelineDrops((prev) => prev.filter((_, j) => j !== i))
                    }
                    title="Click to remove this stage"
                    className={`rounded-sm border px-2 py-1 text-[11px] tabular transition-colors ${
                      st.liquidated
                        ? "border-risk/40 bg-risk/5 text-risk"
                        : "border-hairline bg-background text-ink-soft hover:border-ink"
                    }`}
                  >
                    {s.label} · {fmtRatio(st.collateralRatio)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTimelineDrops((prev) => [...prev, customDrop])}
                className="rounded-sm border border-dashed border-hairline px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-ink"
              >
                + add −{customDrop}% stage
              </button>
            </div>
            {timelineAllLiquidated && (
              <p className="text-xs text-risk">
                This path liquidates the position: at least one stage ends below the{" "}
                {threshold}% threshold.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Custom shock + presets */}
      {validInputs && (
        <section className="mb-10 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-4 rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
              User-defined shock
            </h2>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
                Price drop
                <span className="tabular text-sm font-semibold text-ink">
                  −{customDrop.toFixed(0)}%
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
              <div className="rounded-sm border border-hairline bg-background px-3 py-3 text-sm">
                <p className="flex items-baseline justify-between">
                  <span className="text-ink-faint">Price at</span>
                  <span className="tabular text-ink">
                    {usd(customScenario.shockedPriceUsd, 0)}
                  </span>
                </p>
                <p className="flex items-baseline justify-between">
                  <span className="text-ink-faint">Collateral ratio</span>
                  <span
                    className={`tabular font-medium ${
                      customScenario.liquidated ? "text-risk" : "text-ink"
                    }`}
                  >
                    {fmtRatio(customScenario.collateralRatio)}
                  </span>
                </p>
                <p className="mt-1 text-xs">
                  {customScenario.liquidated ? (
                    <span className="text-risk">
                      Below threshold — liquidatable.
                    </span>
                  ) : (
                    <span className="text-accent">
                      Survives, then absorbs another{" "}
                      {fmtPct(customScenario.headroomDropPct)} before liquidation.
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
              Preset shocks
            </h2>
            <ScenarioBars scenarios={scenarioStates} liquidationThresholdPct={threshold} />
            <ul className="mt-3 divide-y divide-hairline border-t border-hairline text-sm">
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
      <section className="mb-10 rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
          Mezo integration — live read-only
        </h2>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-ink-soft">
          The only live call in DROPTEST is documented by Mezo and read-only.
          On success, &quot;Sync spot&quot; fills the price input from the
          testnet oracle; if the read fails, nothing happens and the manual
          price you typed stands.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <MezoOracleBadge onPrice={syncFromOracle} />
          <div className="rounded-sm border border-hairline bg-background p-3 text-xs leading-relaxed text-ink-faint">
            <p>
              Network · Mezo Testnet (chain id{" "}
              <code className="tabular">{MEZO_TESTNET.chainId}</code>, RPC{" "}
              <code className="break-all">rpc.test.mezo.org</code>) — values from
              Mezo&apos;s official developer docs.
            </p>
            <p className="mt-2">
              MUSD on testnet:{" "}
              <code className="break-all tabular">{MEZO_TESTNET.musd}</code>{" "}
              (18 decimals). Explorer:{" "}
              <a
                href={MEZO_TESTNET.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                explorer.test.mezo.org
              </a>
              .
            </p>
            <p className="mt-2">
              No wallet connection, no transaction signing, no live position
              reads — DROPTEST deliberately keeps simulations fully client-side.
            </p>
          </div>
        </div>
      </section>

      {/* Assumptions */}
      <section className="rounded-sm border border-hairline bg-surface-strong p-4 sm:p-5">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
          Assumptions &amp; sources
        </h2>
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
          Position incomplete — all three inputs must be greater than zero for
          the model to run.
        </p>
      )}

      <p className="mt-8 text-center text-xs text-ink-faint">
        All figures above recompute live from your inputs only — nothing is
        fetched into them except the opt-in oracle price sync. See the{" "}
        <Link href="/" className="text-accent underline underline-offset-2">
          overview
        </Link>{" "}
        for methodology and sources.
      </p>
    </main>
  );
}
