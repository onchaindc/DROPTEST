"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { type MezoNetwork } from "@/lib/mezo/verified";
import { createMezoClient } from "@/lib/mezo/client";
import { fetchBtcUsdPrice, type MezoReadClient, type OracleReading } from "@/lib/mezo/oracle";
import { dateTime, timeAgo } from "@/lib/format";

type OracleState = { status: "idle" } | { status: "loading" } | { status: "settled"; reading: OracleReading };

export interface OracleBadgeProps {
  /** Network the read targets. Must come from a labelled selector. */
  network: MezoNetwork;
  /**
   * Fires when a fresh oracle price has been read successfully. The
   * second argument is the round's updatedAt, so the lab can label a
   * synced price with when the oracle actually answered.
   */
  onPrice?: (priceUsd: number, updatedAtMs?: number) => void;
  className?: string;
}

/**
 * Live BTC/USD read-out from the documented Skip aggregator on the
 * selected Mezo network, with explicit states: fresh, stale, or failed.
 * The card never invents a price; when the RPC is unreachable it says
 * so and the manual input keeps working.
 */
export function MezoOracleBadge({ network, onPrice, className }: OracleBadgeProps) {
  const [state, setState] = useState<OracleState>({ status: "idle" });
  // Ticking clock so "x min ago" stays truthful while the page is open.
  // Reads only inside effects: a prerendered shell must not capture a
  // build-time timestamp.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const client: MezoReadClient = useMemo(
    () => createMezoClient(network),
    [network],
  );

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    const next = await fetchBtcUsdPrice(network, client);
    setState({ status: "settled", reading: next });
    setNow(Date.now());
    if (next.kind === "ok") onPrice?.(next.priceUsd, next.updatedAtMs);
  }, [network, client, onPrice]);

  useEffect(() => {
    // Reset happens inside the deferred read: an effect must not call
    // setState synchronously.
    const t = setTimeout(() => {
      setState({ status: "idle" });
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const settled = state.status === "settled" ? state.reading : null;
  const staleReading =
    settled !== null && settled.kind === "ok" && settled.stale;

  return (
    <div
      className={
        className ??
        "flex flex-col gap-1 rounded-sm border border-hairline bg-surface-strong p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
          {network.label.split(" (")[0]} · BTC/USD
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:bg-background"
        >
          {state.status === "loading" ? "Reading…" : "Refresh"}
        </button>
      </div>
      {state.status === "idle" && (
        <p className="text-xs text-ink-faint">No reading yet.</p>
      )}
      {state.status === "loading" && (
        <p className="text-xs text-ink-faint">Calling the Skip aggregator…</p>
      )}
      {settled !== null && settled.kind === "ok" && (
        <>
          <p className="tabular text-sm text-ink-soft">
            ${settled.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-ink-faint">
            Round {String(settled.roundId)} at block {settled.blockNumber}, chain id{" "}
            {settled.chainId} (verified), decimals {settled.decimals}.
          </p>
          <p
            className={`text-[11px] ${
              staleReading ? "text-amber" : "text-ink-faint"
            }`}
          >
            Oracle last updated {dateTime(settled.updatedAtMs)}
            {now !== null
              ? ` (${timeAgo(settled.updatedAtMs, now)})`
              : ""}
            .
            {staleReading && " This reading is stale. Do not treat it as live data."}
          </p>
        </>
      )}
      {settled !== null && settled.kind === "error" && (
        <p className="text-xs text-risk">
          Oracle read failed ({settled.stage}: {settled.message}). No price is invented;
          your manual input still works.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Read-only calls to the Skip aggregator{" "}
        <code className="break-all tabular">{network.contracts.btcUsdAggregator}</code> via{" "}
        <code className="break-all tabular">{network.rpc}</code> after verifying the
        connected chain id. Per Mezo docs this feed updates every block, and its{" "}
        <code className="tabular">decimals()</code> value is read from the chain (18, not
        Chainlink-typical 8). Nothing else is fetched, and oracle values are always shown
        separately from prices you type by hand.
      </p>
    </div>
  );
}
