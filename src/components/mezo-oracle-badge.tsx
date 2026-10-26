"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, defineChain, http, parseAbi } from "viem";

import { MEZO_TESTNET } from "@/lib/mezo/verified";

/**
 * Aggregator ABI slice — only what we need. `latestRoundData` on
 * Mezo's Skip BTC/USD feed returns the documented fields; we ignore
 * annotations and keep answer/decimals/updatedAt roundTrip.
 */
const AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

const mezoTestnet = defineChain({
  id: MEZO_TESTNET.chainId,
  name: "Mezo Testnet",
  nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [MEZO_TESTNET.rpc] } },
  blockExplorers: {
    default: { name: "Mezo Testnet Explorer", url: MEZO_TESTNET.explorer },
  },
});

type OracleState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; priceUsd: number; roundId: bigint; blockNumber: number; decimals: number }
  | { status: "error"; message: string };

export function fetchMezoBtcPrice(): Promise<OracleState> {
  return new Promise(async (resolve) => {
    try {
      const client = createPublicClient({ chain: mezoTestnet, transport: http() });
      const blockNumber = await client.getBlockNumber();
      const [round, decimals] = await Promise.all([
        client.readContract({
          address: MEZO_TESTNET.btcUsdAggregator,
          abi: AGGREGATOR_ABI,
          functionName: "latestRoundData",
        }),
        client.readContract({
          address: MEZO_TESTNET.btcUsdAggregator,
          abi: AGGREGATOR_ABI,
          functionName: "decimals",
        }),
      ]);
      const [roundId, answer] = round;
      if (answer <= 0n) {
        resolve({ status: "error", message: "Oracle returned a non-positive answer." });
        return;
      }
      const priceUsd = Number(answer) / 10 ** Number(decimals);
      resolve({
        status: "ok",
        priceUsd,
        roundId,
        blockNumber: Number(blockNumber),
        decimals: Number(decimals),
      });
    } catch (err) {
      resolve({
        status: "error",
        message: err instanceof Error ? err.message.slice(0, 160) : "Unknown RPC error.",
      });
    }
  });
}

export interface OracleBadgeProps {
  /** Fires when a fresh oracle price has been read successfully. */
  onPrice?: (priceUsd: number) => void;
  className?: string;
}

/**
 * Live Mezo testnet BTC/USD read-out with explicit states. This card
 * never silently decides prices: when the RPC is unreachable we say so.
 */
export function MezoOracleBadge({ onPrice, className }: OracleBadgeProps) {
  const [state, setState] = useState<OracleState>({ status: "idle" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    const next = await fetchMezoBtcPrice();
    setState(next);
    if (next.status === "ok") onPrice?.(next.priceUsd);
  }, [onPrice]);

  useEffect(() => {
    // Single read on mount, deferred out of the render/effect phase; a
    // manual refresh button serves subsequent reads. Mezo's oracle
    // updates every block, but polling would only burn RPC calls.
    const t = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <div
      className={
        className ??
        "flex flex-col gap-1 rounded-sm border border-hairline bg-surface-strong p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
          Mezo testnet · BTC/USD
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:bg-background"
        >
          {state.status === "loading" ? "Reading…" : "Refresh"}
        </button>
      </div>
      {state.status === "ok" && (
        <p className="tabular text-sm text-ink-soft">
          ${state.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
          <span className="text-xs text-ink-faint">
            round {String(state.roundId)} · block {state.blockNumber}
          </span>
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-risk">
          Oracle read failed ({state.message}). Manual price input still works.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Read-only call to the Skip aggregator{" "}
        <code className="break-all tabular">{MEZO_TESTNET.btcUsdAggregator}</code> over{" "}
        <code className="tabular">rpc.test.mezo.org</code>. Per Mezo docs, this feed
        updates every block; no other data is fetched.
      </p>
    </div>
  );
}
