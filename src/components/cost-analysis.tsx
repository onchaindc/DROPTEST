"use client";

import { useMemo, useState } from "react";

import {
  borrowingCosts,
  DOCUMENTED_FEES,
  DOC_CONFLICTS,
  FEES_SOURCE,
  GAS_DEPOSIT_MUSD,
  redemptionImpact,
  REDEMPTION_MECHANICS_SOURCE,
} from "@/lib/engine/fees";
import {
  daysUntilInterestReachesLiquidation,
  projectInterest,
} from "@/lib/engine/interest";
import {
  LIQUIDATION_DOCS_SOURCE,
  LIQUIDATOR_REWARD_PCT,
  liquidationStatement,
} from "@/lib/engine/liquidation";
import type { RiskModelInput } from "@/lib/engine/risk";
import { btc, musd, pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";

function Row({
  label,
  value,
  hint,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: "risk" | "accent" | "amber";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-2">
      <span className="text-xs text-ink-soft">
        {label}
        {hint && <span className="mt-0.5 block text-[10px] text-ink-faint">{hint}</span>}
      </span>
      <span
        className={`tabular shrink-0 text-right text-sm ${
          strong ? "font-medium" : ""
        } ${
          tone === "risk"
            ? "text-risk"
            : tone === "accent"
              ? "text-accent"
              : tone === "amber"
                ? "text-amber"
                : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border border-hairline bg-surface-strong p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export interface CostAnalysisProps {
  inputs: RiskModelInput;
  /** Annual interest assumption in percent. */
  aprPct: number;
  onAprChange: (next: number) => void;
  /** When the APR came from a live trove, say so. */
  liveAprSource?: string | null;
}

/**
 * Costs and drag: what a borrow costs at the documented fee schedule,
 * what interest does to the liquidation price, what a liquidation
 * actually splits into, and what a redemption against this trove would
 * do. Every input stays labelled: documented, on-chain, or assumed.
 */
export function CostAnalysis({
  inputs,
  aprPct,
  onAprChange,
  liveAprSource,
}: CostAnalysisProps) {
  const [borrowInput, setBorrowInput] = useState(
    String(Math.round(inputs.musdDebt)),
  );
  const [redeemInput, setRedeemInput] = useState("1000");

  const borrowAmount = Number(borrowInput.replace(/,/g, ""));
  const costs = useMemo(() => borrowingCosts(borrowAmount), [borrowAmount]);

  const projection = useMemo(
    () => projectInterest(inputs, aprPct),
    [inputs, aprPct],
  );
  const daysToLiquidation = useMemo(
    () => daysUntilInterestReachesLiquidation(inputs, aprPct),
    [inputs, aprPct],
  );
  const statement = useMemo(() => liquidationStatement(inputs), [inputs]);

  const redeemAmount = Number(redeemInput.replace(/,/g, ""));
  const redemption = useMemo(
    () => redemptionImpact(inputs, redeemAmount),
    [inputs, redeemAmount],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title="What this borrow costs"
        aside={
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-faint">
            Documented fees
          </span>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-soft">MUSD to borrow</span>
          <div className="flex items-baseline border border-hairline bg-background px-3 py-2 focus-within:border-ink">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={borrowInput}
              onChange={(e) => setBorrowInput(e.target.value)}
              className="tabular w-full bg-transparent text-sm outline-none"
              aria-label="MUSD amount to borrow for the cost estimate"
            />
            <span className="ml-2 shrink-0 text-[11px] text-ink-faint">MUSD</span>
          </div>
        </label>

        {costs ? (
          <div className="mt-3">
            <Row
              label="Issuance fee"
              hint={`${costs.issuanceFeePct}% of borrowed MUSD, paid in MUSD`}
              value={musd(costs.issuanceFeeMusd, 2)}
            />
            <Row
              label="Net MUSD received"
              hint="If the fee is paid out of the proceeds"
              value={musd(costs.netMusdReceived, 2)}
              strong
            />
            <Row
              label="Debt if the fee is capitalised"
              hint="The other reading of “paid in MUSD” — shown, not chosen"
              value={musd(costs.debtIfFeeCapitalisedMusd, 2)}
            />
            <Row
              label="Gas deposit locked at open"
              hint={`Flat ${GAS_DEPOSIT_MUSD} MUSD, returned on close`}
              value={musd(costs.gasDepositMusd, 0)}
            />
            <Row
              label="Fee + deposit as a share of the borrow"
              value={fmtPct(costs.upfrontCostPct)}
              strong
            />
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber">
            Enter a MUSD amount greater than zero to see the fee breakdown.
          </p>
        )}

        <details className="mt-4 border-t border-hairline pt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-ink-soft">
            Full documented fee schedule
          </summary>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-soft">
            {DOCUMENTED_FEES.map((fee) => (
              <li key={fee.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{fee.label}:</span>
                <span className="tabular">{fee.value}</span>
                <span className="text-ink-faint">— {fee.charged}</span>
              </li>
            ))}
          </ul>
          {DOC_CONFLICTS.map((conflict) => (
            <p key={conflict.topic} className="mt-2 text-[11px] leading-relaxed text-amber">
              {conflict.topic}: the docs disagree ({conflict.first} vs{" "}
              {conflict.second}). {conflict.note}
            </p>
          ))}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Source:{" "}
            <a
              href={FEES_SOURCE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2"
            >
              Mezo docs · MUSD fees
            </a>
            . The live system panel shows what the chain answers right now.
          </p>
        </details>
      </Card>

      <Card
        title="Interest drag"
        aside={
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-faint">
            Assumption
          </span>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
            Annual interest assumption
            <span className="tabular text-sm font-semibold text-ink">
              {aprPct.toFixed(2)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.25}
            value={aprPct}
            onChange={(e) => onAprChange(Number(e.target.value))}
            className="accent-ink"
            aria-label="Annual interest assumption in percent"
          />
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
          {liveAprSource
            ? `Rate taken from ${liveAprSource}. Simple interest, debt grows linearly.`
            : "Mezo documents 1–5% fixed at open but does not publish a live rate. Move the slider to test any assumption; debt is static everywhere else in the app."}
        </p>

        {projection ? (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-widest text-ink-faint">
                    <th className="py-1.5 pr-2 font-medium">Horizon</th>
                    <th className="py-1.5 pr-2 font-medium">Debt</th>
                    <th className="py-1.5 pr-2 font-medium">Ratio</th>
                    <th className="py-1.5 font-medium">Liquidation price</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.horizons.map((h) => (
                    <tr key={h.days} className="border-b border-hairline last:border-0">
                      <td className="py-1.5 pr-2 text-ink-soft">{h.days} days</td>
                      <td className="tabular py-1.5 pr-2">{usd(h.debtMusd, 0)}</td>
                      <td
                        className={`tabular py-1.5 pr-2 ${
                          h.liquidatedByInterest ? "text-risk" : ""
                        }`}
                      >
                        {fmtRatio(h.collateralRatio)}
                      </td>
                      <td className="tabular py-1.5">
                        {usd(h.liquidationPriceUsd, 0)}
                        <span className="ml-1 text-[10px] text-ink-faint">
                          (+{usd(h.liquidationPriceUsd - projection.baseLiquidationPriceUsd, 0)})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2">
              <Row
                label="Liquidation price today"
                value={usd(projection.baseLiquidationPriceUsd, 0)}
              />
              <Row
                label="Interest-only runway"
                hint="At a constant price, how long until accrued interest alone lifts the liquidation price to spot"
                value={
                  daysToLiquidation === null
                    ? "—"
                    : !Number.isFinite(daysToLiquidation)
                      ? "No erasure (0% rate)"
                      : daysToLiquidation === 0
                        ? "Already at the line"
                        : `${Math.round(daysToLiquidation).toLocaleString()} days`
                }
                tone={
                  daysToLiquidation !== null &&
                  Number.isFinite(daysToLiquidation) &&
                  daysToLiquidation < 365
                    ? "amber"
                    : undefined
                }
              />
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs text-amber">
            This position cannot be projected. Check the inputs.
          </p>
        )}
      </Card>

      <Card
        title="What a liquidation splits into"
        aside={
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-faint">
            At the threshold price
          </span>
        }
      >
        {statement ? (
          <>
            <Row label="Collateral value seized" value={usd(statement.collateralValueUsd, 0)} />
            <Row
              label={`Liquidator reward (${LIQUIDATOR_REWARD_PCT}% of collateral)`}
              value={usd(statement.liquidatorRewardUsd, 0)}
            />
            <Row
              label="Gas compensation"
              value={musd(statement.gasCompensationMusd, 0)}
            />
            <Row
              label="To the Stability Pool after the reward"
              value={usd(statement.stabilityPoolCollateralUsd, 0)}
            />
            <Row
              label="Debt burned"
              value={musd(statement.debtMusd, 0)}
            />
            <Row
              label="Pool surplus after debt and gas"
              value={usd(statement.surplusAfterDebtUsd, 0)}
              tone={statement.surplusAfterDebtUsd < 0 ? "risk" : undefined}
              hint={
                statement.surplusAfterDebtUsd < 0
                  ? "Negative means the collateral does not cover the debt: bad debt."
                  : "Positive means the pool absorbs the trove and keeps a remainder."
              }
            />
            <Row
              label="Bad-debt price (derived)"
              hint="Below this price, 99.5% of collateral stops covering debt + the 200 MUSD gas compensation"
              value={usd(statement.badDebtPriceUsd, 0)}
              tone={statement.badDebtPossible ? "amber" : undefined}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              The documentation describes a liquidator reward, not a
              borrower-facing penalty, and it does not publish a residual for
              the borrower. This model therefore shows the borrower keeping
              nothing. The bad-debt price is algebra over documented
              parameters, not a protocol constant. Source:{" "}
              <a
                href={LIQUIDATION_DOCS_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                mUSD documentation
              </a>
              .
            </p>
          </>
        ) : (
          <p className="text-xs text-amber">No statement for these inputs.</p>
        )}
      </Card>

      <Card
        title="If MUSD is redeemed against this trove"
        aside={
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-faint">
            What-if
          </span>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-soft">MUSD redeemed</span>
          <div className="flex items-baseline border border-hairline bg-background px-3 py-2 focus-within:border-ink">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value)}
              className="tabular w-full bg-transparent text-sm outline-none"
              aria-label="MUSD amount redeemed against this trove"
            />
            <span className="ml-2 shrink-0 text-[11px] text-ink-faint">MUSD</span>
          </div>
        </label>

        {redemption ? (
          <div className="mt-3">
            <Row
              label="Debt removed"
              value={musd(redemption.redeemedMusd, 2)}
            />
            <Row
              label="Collateral sold at par"
              hint="1 MUSD removes $1 of BTC at the oracle price, per the redemption docs"
              value={btc(redemption.collateralSoldBtc)}
            />
            <Row
              label="New collateral ratio"
              value={
                Number.isFinite(redemption.newRatio)
                  ? fmtRatio(redemption.newRatio)
                  : "closed"
              }
              strong
            />
            <Row
              label="Ratio change"
              value={
                Number.isFinite(redemption.ratioChangePct)
                  ? `${redemption.ratioChangePct >= 0 ? "+" : ""}${redemption.ratioChangePct.toFixed(2)} pp`
                  : "—"
              }
              tone={
                Number.isFinite(redemption.ratioChangePct) &&
                redemption.ratioChangePct < 0
                  ? "risk"
                  : "accent"
              }
            />
            {redemption.closesPosition && (
              <p className="mt-2 text-[11px] text-amber">
                This redemption would clear the whole trove.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Redemptions start at the trove with the lowest collateral ratio
              above the MCR and work upward, so this is a what-if — the app
              cannot see the rest of the system&apos;s trove order from one
              position. Above 100% collateral, removing equal dollar amounts
              from both sides raises the ratio: the borrower is force-
              deleveraged at par. Source:{" "}
              <a
                href={REDEMPTION_MECHANICS_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                redemption guide
              </a>
              .
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber">
            Enter a MUSD amount greater than zero.
          </p>
        )}
      </Card>
    </div>
  );
}
