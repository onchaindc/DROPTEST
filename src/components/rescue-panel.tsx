"use client";

import { useMemo } from "react";

import { HISTORICAL_CRASHES, replayHistoricalCrashes } from "@/lib/engine/historical";
import { breakpointLadder, planRescue } from "@/lib/engine/rescue";
import type { RiskModelInput } from "@/lib/engine/risk";
import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  SYSTEM_RECOVERY_MODE_TCR_PCT,
} from "@/lib/mezo/verified";
import { btc, musd, pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";

const TARGET_OPTIONS = [110, 125, 150, 200] as const;

export interface RescuePanelProps {
  inputs: RiskModelInput;
  shockDropPct: number;
  onShockChange: (next: number) => void;
  targetRatioPct: number;
  onTargetChange: (next: number) => void;
  onExportCsv?: () => void;
}

/**
 * Rescue sizing, breakpoint ladder, and a historical replay.
 *
 * All three answers come from inversions of the same ratio formula the
 * engine tests. "Rescue" is deliberately two alternatives — add BTC or
 * repay MUSD — because doing both at once needs a weighting the product
 * does not ask for.
 */
export function RescuePanel({
  inputs,
  shockDropPct,
  onShockChange,
  targetRatioPct,
  onTargetChange,
  onExportCsv,
}: RescuePanelProps) {
  const plan = useMemo(
    () => planRescue(inputs, shockDropPct, targetRatioPct),
    [inputs, shockDropPct, targetRatioPct],
  );
  const atThreshold = useMemo(
    () => planRescue(inputs, shockDropPct, INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT),
    [inputs, shockDropPct],
  );
  const ladder = useMemo(() => breakpointLadder(inputs), [inputs]);
  const crashes = useMemo(() => replayHistoricalCrashes(inputs), [inputs]);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col border border-hairline bg-surface-strong p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Rescue planner</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            Size the top-up before the crash, not after it. Pick a shock and a
            ratio you want to hold, and read the two ways to get there.
          </p>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
              BTC crash to plan for
              <span className="tabular text-sm font-semibold text-ink">
                −{shockDropPct}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={90}
              step={1}
              value={shockDropPct}
              onChange={(e) => onShockChange(Number(e.target.value))}
              className="accent-ink"
              aria-label="BTC crash percentage to plan for"
            />
          </label>

          <div className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-soft">Hold this ratio</span>
            <div className="flex flex-wrap gap-1.5">
              {TARGET_OPTIONS.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => onTargetChange(target)}
                  aria-pressed={targetRatioPct === target}
                  className={`rounded-sm border px-2.5 py-1 text-xs tabular transition-colors ${
                    targetRatioPct === target
                      ? "border-ink bg-ink text-background"
                      : "border-hairline bg-background text-ink-soft hover:border-ink"
                  }`}
                >
                  {target}%
                  {target === INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT && (
                    <span className="ml-1 text-[10px] opacity-70">MCR</span>
                  )}
                  {target === SYSTEM_RECOVERY_MODE_TCR_PCT && (
                    <span className="ml-1 text-[10px] opacity-70">TCR</span>
                  )}
                </button>
              ))}
            </div>
            <span className="text-[11px] leading-snug text-ink-faint">
              {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% is the documented
              per-trove line; {SYSTEM_RECOVERY_MODE_TCR_PCT}% is the separate
              system Recovery Mode trigger.
            </span>
          </div>

          {plan ? (
            <div className="mt-4 border border-hairline bg-background px-3 py-3">
              <p className="flex items-baseline justify-between text-xs">
                <span className="text-ink-faint">Price at the shock</span>
                <span className="tabular text-ink">{usd(plan.shockedPriceUsd, 0)}</span>
              </p>
              <p className="mt-1 flex items-baseline justify-between text-xs">
                <span className="text-ink-faint">Ratio if nothing changes</span>
                <span
                  className={`tabular font-medium ${
                    plan.ratioAtShock < INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT / 100
                      ? "text-risk"
                      : "text-ink"
                  }`}
                >
                  {fmtRatio(plan.ratioAtShock)}
                </span>
              </p>
              {plan.survives ? (
                <p className="mt-2 text-xs text-accent">
                  Holds {targetRatioPct}% without changes, with{" "}
                  {fmtPct(plan.headroomDropPct)} of further drop available
                  before the {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% line.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs">
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="text-ink-faint">Add BTC collateral</span>
                    <span className="tabular font-medium text-ink">
                      {btc(plan.btcToAdd)}
                    </span>
                  </li>
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="text-ink-faint">or repay MUSD</span>
                    <span className="tabular font-medium text-ink">
                      {musd(plan.musdToRepay, 2)}
                    </span>
                  </li>
                </ul>
              )}
              {!plan.survives && (
                <details className="mt-2 border-t border-hairline pt-2">
                  <summary className="cursor-pointer text-[11px] text-ink-soft">
                    Only need to hold the {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%
                    line?
                  </summary>
                  {atThreshold && (
                    <ul className="mt-1.5 space-y-1 text-[11px]">
                      <li className="flex items-baseline justify-between gap-2">
                        <span className="text-ink-faint">Add BTC</span>
                        <span className="tabular text-ink">
                          {btc(atThreshold.btcToAdd)}
                        </span>
                      </li>
                      <li className="flex items-baseline justify-between gap-2">
                        <span className="text-ink-faint">or repay MUSD</span>
                        <span className="tabular text-ink">
                          {musd(atThreshold.musdToRepay, 2)}
                        </span>
                      </li>
                    </ul>
                  )}
                </details>
              )}
              <p className="mt-2 text-[10px] leading-snug text-ink-faint">
                Sized at the shocked price. Doing both is possible; each number
                is an independent single-lever option.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-amber">
              Move the shock below 100% to size a plan.
            </p>
          )}

          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="mt-4 w-fit rounded-sm border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Export risk pack (CSV)
            </button>
          )}
        </div>

        <div className="border border-hairline bg-surface-strong p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Breakpoint ladder</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            The BTC price at which this position&apos;s ratio reaches each line,
            and how far that is from spot.
          </p>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-widest text-ink-faint">
                <th className="py-1.5 pr-2 font-medium">Ratio</th>
                <th className="py-1.5 pr-2 font-medium">BTC price</th>
                <th className="py-1.5 pr-2 font-medium">From spot</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((b) => (
                <tr key={b.targetRatioPct} className="border-b border-hairline last:border-0">
                  <td className="tabular py-1.5 pr-2 font-medium">
                    {b.targetRatioPct}%
                  </td>
                  <td className="tabular py-1.5 pr-2">{usd(b.priceUsd, 0)}</td>
                  <td className="tabular py-1.5 pr-2 text-ink-soft">
                    {b.alreadyBreached ? "—" : `−${fmtPct(b.dropFromSpotPct)}`}
                  </td>
                  <td className="py-1.5">
                    {b.alreadyBreached ? (
                      <span className="text-accent">above target (needs a rally)</span>
                    ) : b.targetRatioPct === INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT ? (
                      <span className="text-risk">documented liquidation line</span>
                    ) : (
                      <span className="text-ink-faint">ahead of spot</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-faint">
            Solved from price = targetRatio × debt / (100 × BTC), the same
            algebra as the liquidation price.
          </p>
        </div>
      </section>

      <section className="border border-hairline bg-surface-strong p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Historical replay</h2>
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-faint">
            Context, not a forecast
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
          Each reference drawdown applied once from today&apos;s spot price. The
          periods are approximate peak-to-trough figures, not a single day&apos;s
          move and not a prediction.
        </p>
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-widest text-ink-faint">
              <th className="py-1.5 pr-2 font-medium">Drawdown</th>
              <th className="py-1.5 pr-2 font-medium">Drop</th>
              <th className="py-1.5 pr-2 font-medium">Price after</th>
              <th className="py-1.5 pr-2 font-medium">Ratio</th>
              <th className="py-1.5 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {crashes.map((row) => (
              <tr key={row.crash.id} className="border-b border-hairline last:border-0">
                <td className="py-1.5 pr-2">
                  <span className="font-medium text-ink">{row.crash.name}</span>
                  <span className="ml-1 text-[10px] text-ink-faint">
                    {row.crash.period}
                  </span>
                </td>
                <td className="tabular py-1.5 pr-2 text-ink-soft">
                  −{row.crash.dropPct}%
                </td>
                <td className="tabular py-1.5 pr-2">{usd(row.shockedPriceUsd, 0)}</td>
                <td
                  className={`tabular py-1.5 pr-2 ${
                    row.liquidated ? "text-risk" : "text-ink"
                  }`}
                >
                  {fmtRatio(row.collateralRatio)}
                </td>
                <td className="py-1.5">
                  {row.liquidated ? (
                    <span className="text-risk">liquidatable</span>
                  ) : (
                    <span className="text-accent">
                      survives, {fmtPct(row.headroomDropPct)} left
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          {HISTORICAL_CRASHES.length} reference drawdowns from the methodology
          page. They are educational context and are never inputs to the live
          model.
        </p>
      </section>
    </div>
  );
}
