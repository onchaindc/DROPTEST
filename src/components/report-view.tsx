"use client";

import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";

import {
  analyze,
  applyScenarios,
  cumulativePricePath,
  reverseStress,
  type ScenarioState,
} from "@/lib/engine/risk";
import { analyzePricePath } from "@/lib/engine/paths";
import { PRESET_SCENARIOS } from "@/lib/engine/scenarios";
import {
  DOC_CONFLICT_NOTE,
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
} from "@/lib/mezo/verified";
import { dateTime, pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";
import { RatioCurve, TimelineChart, PathCompareChart } from "@/components/charts";
import {
  createStableReader,
  subscribeToStorage,
} from "@/lib/local-store";
import {
  STORAGE_KEY,
  sanitizeReportSnapshot,
  type ReportSnapshot,
} from "@/lib/report";

const LINE_COLORS = ["#0f766e", "#b45309", "#4a4f5a"];

/** Stable reader over the session report snapshot; server sees null. */
const readReportSnapshot = createStableReader<ReportSnapshot | null>({
  storage: () => window.sessionStorage,
  key: STORAGE_KEY,
  parse: (raw) => sanitizeReportSnapshot(JSON.parse(raw)),
  empty: () => null,
});

export function ReportView() {
  const snapshot = useSyncExternalStore(
    subscribeToStorage,
    readReportSnapshot,
    () => null,
  );

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Risk report</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
          No report data found. Reports are generated from the Stress Lab or
          the Scenario Studio and stay in this browser tab.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/lab"
            className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Open the stress lab
          </Link>
          <Link
            href="/studio"
            className="rounded-sm border border-hairline bg-surface-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Compare scenarios
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ReportContent
      key={snapshot.generatedAt}
      snapshot={snapshot}
    />
  );
}


function ReportContent({
  snapshot,
}: {
  snapshot: ReportSnapshot;
}) {
  const { inputs } = snapshot;

  const metrics = useMemo(() => {
    try {
      return analyze(inputs);
    } catch {
      return null;
    }
  }, [inputs]);

  const scenarioRows: ScenarioState[] = useMemo(() => {
    try {
      return applyScenarios(inputs, PRESET_SCENARIOS);
    } catch {
      return [];
    }
  }, [inputs]);

  const timelineStages = useMemo(() => {
    const stageDrops =
      snapshot.timelineDropsPct !== undefined
        ? snapshot.timelineDropsPct
        : [snapshot.customDropPct ?? 50];
    const prices = cumulativePricePath(inputs.btcPriceUsd, stageDrops);
    return prices.map((price, i) => ({
      label: `Stage ${i + 1}`,
      priceUsd: price,
      cumulativeDropPct: (1 - price / inputs.btcPriceUsd) * 100,
    }));
  }, [snapshot, inputs]);

  const reverseChecked = useMemo(() => {
    try {
      return reverseStress(inputs, INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT);
    } catch {
      return null;
    }
  }, [inputs]);

  const studioPaths = useMemo(() => {
    if (!snapshot.paths || snapshot.paths.length === 0) return null;
    return snapshot.paths.map((p, i) => ({
      id: `p-${i}`,
      name: p.name,
      stepLabel: p.stepLabel,
      color: LINE_COLORS[i % LINE_COLORS.length],
      points: analyzePricePath(inputs, {
        id: `p-${i}`,
        name: p.name,
        stepLabel: p.stepLabel,
        dropPcts: p.dropPcts,
      }),
    }));
  }, [snapshot, inputs]);

  const generatedAt = Date.parse(snapshot.generatedAt);
  const shownGenerated = dateTime(generatedAt);

  if (!metrics) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Risk report</h1>
        <p className="mt-3 text-sm text-ink-soft">
          The saved inputs are incomplete, so the model could not run. Go back
          to the <Link href="/lab" className="text-accent underline">Stress Lab</Link>,
          fix the position, and generate the report again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="no-print mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Risk report
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            Use your browser&apos;s print dialog to save this as a PDF. The
            report contains only the inputs you typed and the numbers the
            engine computed.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={snapshot.origin === "studio" ? "/studio" : "/lab"}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-surface-strong"
          >
            Back to {snapshot.origin === "studio" ? "Scenario Studio" : "Stress Lab"}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Print or save as PDF
          </button>
        </div>
      </div>

      <article className="border border-hairline bg-surface-strong p-5 sm:p-8">
        <header className="border-b border-hairline pb-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-ink-faint">
            DROPTEST hypothetical risk report
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            BTC-backed MUSD position stress report
          </h2>
          <p className="mt-1 text-xs text-ink-faint">
            Generated {shownGenerated} from the{" "}
            {snapshot.origin === "studio" ? "Scenario Studio" : "Stress Lab"}.
            All figures are hypothetical. No wallet or personal data is
            included.
          </p>
        </header>

        {/* Position inputs */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Position inputs</h3>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {[
                ["BTC collateral", `${inputs.btcCollateral.toLocaleString(undefined, { maximumFractionDigits: 6 })} BTC`],
                ["MUSD debt (total)", usd(inputs.musdDebt, 2)],
                ["Spot BTC price at generation", usd(inputs.btcPriceUsd, 2)],
                [
                  "Selected liquidation threshold",
                  `${inputs.liquidationThresholdPct}%${
                    inputs.liquidationThresholdPct === INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT
                      ? " (documented default)"
                      : " (user-adjusted assumption)"
                  }`,
                ],
              ].map(([term, value]) => (
                <tr key={term} className="border-t border-hairline">
                  <td className="py-1.5 pr-4 text-ink-faint">{term}</td>
                  <td className="tabular py-1.5 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Base metrics */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Results at the entered spot price</h3>
          <dl className="mt-2 grid grid-cols-2 gap-px border bg-hairline sm:grid-cols-3">
            {[
              ["Collateral value", usd(metrics.collateralValueUsd, 2)],
              ["Collateral ratio", fmtRatio(metrics.collateralRatio)],
              ["LTV", fmtRatio(metrics.ltv)],
              ["Liquidation price", usd(metrics.liquidationPriceUsd, 2)],
              ["Drop to liquidation", fmtPct(metrics.dropToLiquidationPct)],
              [
                "Reverse stress: price at a 110% ratio",
                reverseChecked
                  ? reverseChecked.alreadyBreached
                    ? `${usd(reverseChecked.priceUsd, 0)} above spot`
                    : `${usd(reverseChecked.priceUsd, 0)} (a ${fmtPct(reverseChecked.dropFromSpotPct)} drop)`
                  : "N/A",
              ],
            ].map(([term, value]) => (
              <div key={term} className="bg-surface-strong px-3 py-2.5">
                <dt className="text-[10px] uppercase tracking-widest text-ink-faint">{term}</dt>
                <dd className="tabular mt-1 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Scenario results */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Preset shock results</h3>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-faint">
                <th className="py-1.5 pr-2 font-medium">Shock</th>
                <th className="py-1.5 pr-2 font-medium">Price after</th>
                <th className="py-1.5 pr-2 font-medium">Collateral ratio</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {scenarioRows.map((s) => (
                <tr key={s.id} className="border-b border-hairline last:border-0">
                  <td className="py-1.5 pr-2">
                    {s.label} <span className="text-ink-faint">(−{s.dropPct}%)</span>
                  </td>
                  <td className="tabular py-1.5 pr-2">{usd(s.shockedPriceUsd, 0)}</td>
                  <td className="tabular py-1.5 pr-2">{fmtRatio(s.collateralRatio)}</td>
                  <td className={`py-1.5 ${s.liquidated ? "text-risk" : "text-ink-soft"}`}>
                    {s.liquidated
                      ? `Liquidatable (below ${inputs.liquidationThresholdPct}%)`
                      : `${fmtPct(s.headroomDropPct)} of further drop left`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Studio paths */}
        {studioPaths && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold">Compared price paths</h3>
            <p className="mt-1 text-[11px] text-ink-faint">
              User-drawn hypothetical paths. These are not Mezo data.
            </p>
            <PathCompareChart
              paths={studioPaths.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
                points: p.points.map((pt) => ({
                  step: pt.step,
                  ratioPct: pt.collateralRatio * 100,
                })),
              }))}
              thresholdPct={inputs.liquidationThresholdPct}
              maxStep={studioPaths.reduce((m, p) => Math.max(m, p.points.length), 0)}
            />
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="border-b border-hairline text-left text-ink-faint">
                  <th className="py-1.5 pr-2 font-medium">Path</th>
                  <th className="py-1.5 pr-2 font-medium">Lowest ratio</th>
                  <th className="py-1.5 pr-2 font-medium">First breach</th>
                  <th className="py-1.5 font-medium">Ending collateral value</th>
                </tr>
              </thead>
              <tbody>
                {studioPaths.map((p) => {
                  const last = p.points[p.points.length - 1] ?? null;
                  const lowest = p.points.reduce(
                    (lo, pt) => (pt.collateralRatio < lo.collateralRatio ? pt : lo),
                    p.points[0],
                  );
                  const breach = p.points.find((pt) => pt.liquidated) ?? null;
                  return (
                    <tr key={p.id} className="border-b border-hairline last:border-0">
                      <td className="py-1.5 pr-2 font-medium">{p.name}</td>
                      <td className="tabular py-1.5 pr-2">
                        {lowest ? fmtRatio(lowest.collateralRatio) : "no steps"}
                      </td>
                      <td className="py-1.5 pr-2">
                        {breach
                          ? `${breach.label} (−${fmtPct(breach.cumulativeDropPct)} from spot)`
                          : "None"}
                      </td>
                      <td className="tabular py-1.5">
                        {last
                          ? `${usd(last.collateralValueUsd, 0)} (ratio ${fmtRatio(last.collateralRatio)})`
                          : "No steps"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Charts */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Collateral ratio vs BTC price</h3>
            <RatioCurve
              btcCollateral={inputs.btcCollateral}
              musdDebt={inputs.musdDebt}
              spotPriceUsd={inputs.btcPriceUsd}
              liquidationPriceUsd={metrics.liquidationPriceUsd}
              liquidationThresholdPct={inputs.liquidationThresholdPct}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Staged crash timeline</h3>
            <TimelineChart
              btcCollateral={inputs.btcCollateral}
              musdDebt={inputs.musdDebt}
              spotPriceUsd={inputs.btcPriceUsd}
              stages={timelineStages}
              liquidationThresholdPct={inputs.liquidationThresholdPct}
            />
          </div>
        </section>

        {/* Assumptions */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Assumptions</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-soft">
            <li>
              Liquidation threshold: a trove is liquidatable when its
              collateral ratio falls below the selected threshold. The
              documented Mezo value is {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%;
              anything else selected in the app is a user-adjusted assumption.
            </li>
            <li>
              Recovery Mode is a system-wide trigger when total collateral
              ratio falls below 150%. It is not a per-position liquidation
              line and it is not modelled here.
            </li>
            <li>
              Liquidation outcome: per the mUSD documentation the liquidator
              receives 0.5% of collateral plus {200} MUSD gas compensation and
              the Stability Pool burns the debt, so the modelled borrower
              recovers nothing from a liquidated position.
            </li>
            <li>
              Interest: the model does not accrue interest. Mezo documents
              initial fixed rates of 1% to 5% and a 0.1% borrowing charge, but
              the live rate is not published, so the entered debt is treated
              as static.
            </li>
            <li>
              Prices: the spot price is either typed by hand or read once from
              the documented read-only Mezo mainnet oracle. When a position is
              loaded from the live TroveManager, its collateral and debt are
              on-chain values fetched read-only by public address; every ratio,
              liquidation price, and scenario outcome is calculated. No wallet
              connection or signing is used.
            </li>
          </ul>
        </section>

        {/* Sources */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Source references</h3>
          <ul className="mt-2 space-y-1 text-[11px] text-ink-faint">
            {[
              ["Mezo developer guide: mUSD collateral ratio and liquidation", "https://mezo.org/docs/developers/musd/"],
              ["mUSD documentation: liquidation mechanics (Stability Pool, gas compensation)", "https://github.com/mezo-org/musd/blob/main/docs/README.md"],
              ["Mezo docs: minting mUSD, interest and fees", "https://mezo.org/docs/users/borrow/mint-musd/"],
              ["Mezo docs: oracle addresses (Skip BTC/USD aggregator)", "https://mezo.org/docs/developers/architecture/oracles/"],
              ["Older Mezo blog with the 150% wording (documented conflict)", DOC_CONFLICT_NOTE.source],
            ].map(([label, href]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                  {label}
                </a>{" "}
                {href.replace("https://", "")}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-6 border-t border-hairline pt-3 text-[10px] leading-relaxed text-ink-faint">
          <p>
            Hypothetical analysis only. DROPTEST does not connect to wallets,
            does not read live positions, and is not financial advice. Preset
            shocks and paths are illustrative defaults, not predictions.
          </p>
          <p className="mt-1">Generated {shownGenerated} · DROPTEST</p>
        </footer>
      </article>
    </main>
  );
}
