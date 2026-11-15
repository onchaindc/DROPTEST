"use client";

import { useEffect, useMemo, useState } from "react";

import { analyze } from "@/lib/engine/risk";
import { DEFAULT_SPOT_BTC_USD } from "@/lib/engine/scenarios";
import { DEFAULT_MEZO_NETWORK, INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT } from "@/lib/mezo/verified";
import { createMezoClient } from "@/lib/mezo/client";
import { fetchBtcUsdPrice, type OracleReading } from "@/lib/mezo/oracle";
import { pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";

type PriceState =
  | { status: "loading" }
  | { status: "ok"; reading: Extract<OracleReading, { kind: "ok" }> }
  | { status: "error" };

/**
 * The landing page's one-glance illustration: a sample position at 150%
 * collateral, marked against a live Mezo oracle price. This is the
 * product in a single card — the ratio, the liquidation price and the
 * distance between them — and it falls back to the documented sample
 * price if the read fails, clearly labelled.
 */
export function HeroSnapshot() {
  const network = DEFAULT_MEZO_NETWORK;
  const [state, setState] = useState<PriceState>({ status: "loading" });

  const client = useMemo(() => createMezoClient(network), [network]);

  useEffect(() => {
    let cancelled = false;
    void fetchBtcUsdPrice(network, client).then((reading) => {
      if (cancelled) return;
      setState(reading.kind === "ok" ? { status: "ok", reading } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [network, client]);

  const livePrice = state.status === "ok" ? state.reading.priceUsd : null;
  const price = livePrice ?? DEFAULT_SPOT_BTC_USD;
  const btcCollateral = 0.25;
  // A 150% collateral ratio is the sample's starting point.
  const musdDebt = (btcCollateral * price) / 1.5;
  const metrics = analyze({
    btcCollateral,
    musdDebt,
    btcPriceUsd: price,
    liquidationThresholdPct: INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  });

  const gaugePct = Math.min(100, (metrics.collateralRatio * 100) / 250);
  const thresholdPct = Math.min(100, (INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT / 250) * 100);

  return (
    <div className="card relative overflow-hidden p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Sample position</p>
          <p className="mt-1 text-sm font-medium text-ink">
            0.25 BTC against {usd(musdDebt, 0)} MUSD
          </p>
        </div>
        <span className="chip shrink-0">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              state.status === "ok" ? "bg-accent" : state.status === "loading" ? "bg-ink-faint" : "bg-amber"
            }`}
          />
          {state.status === "ok" ? "Live BTC price" : state.status === "loading" ? "Reading…" : "Sample price"}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-faint">Collateral ratio</p>
          <p className="tabular mt-0.5 text-3xl font-semibold tracking-tight text-ink">
            {fmtRatio(metrics.collateralRatio)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-widest text-ink-faint">BTC price</p>
          <p className="tabular mt-0.5 text-lg font-medium text-ink">{usd(price, 0)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent"
            style={{ width: `${gaugePct}%` }}
          />
          <div
            aria-hidden
            className="absolute top-[-3px] h-[14px] w-[2px] rounded-full bg-risk"
            style={{ left: `${thresholdPct}%` }}
          />
        </div>
        <div className="relative mt-2 h-3 text-[10px] text-ink-faint">
          <span className="absolute left-0">0%</span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-risk"
            style={{ left: `${thresholdPct}%` }}
          >
            {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% line
          </span>
          <span className="absolute right-0">250%</span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
        {[
          ["Liquidation price", usd(metrics.liquidationPriceUsd, 0)],
          ["Distance to it", `−${fmtPct(metrics.dropToLiquidationPct)}`],
          ["Collateral value", usd(metrics.collateralValueUsd, 0)],
          ["LTV", fmtRatio(metrics.ltv)],
        ].map(([term, value]) => (
          <div key={term} className="bg-surface px-3 py-2.5">
            <dt className="text-[10px] uppercase tracking-widest text-ink-faint">{term}</dt>
            <dd className="tabular mt-0.5 text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        {state.status === "ok" ? (
          <>
            {state.reading.stale ? "Last read" : "Read just now"} from the Skip BTC/USD oracle on
            Mezo mainnet.{" "}
          </>
        ) : state.status === "error" ? (
          <>The oracle read failed, so this card uses the documented sample price. </>
        ) : null}
        Illustrative position — nothing here is your wallet.
      </p>
    </div>
  );
}
