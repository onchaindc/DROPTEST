"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, defineChain, http, parseAbi } from "viem";

import { MEZO_TESTNET } from "@/lib/mezo/verified";
import { dateTime, timeAgo } from "@/lib/format";

/**
 * Aggregator ABI slice, only what we need. `latestRoundData` on
 * Mezo's Skip BTC/USD feed returns the documented fields; we keep
 * answer, decimals, and updatedAt so the reader can judge freshness.
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

/**
 * A reading older than this is flagged as stale. The feed is supposed
 * to update every block, so a week-old answer on a paused testnet
 * should not look fresh to the user.
 */
const STALE_MS = 2 * 60 * 60 * 1000;

type OracleState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; priceUsd: number; roundId: bigint; blockNumber: number; updatedAtMs: number }
  | { status: "error"; message: string };

/** Read the documented Skip BTC/USD aggregator on Mezo testnet, read-only. */
export async function fetchMezoBtcPriceAsync(): Promise<OracleState> {
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
    const [roundId, answer, , updatedAt] = round;
    if (answer <= 0n) {
      return { status: "error", message: "Oracle returned a non-positive answer." };
    }
    const priceUsd = Number(answer) / 10 ** Number(decimals);
    const updatedAtMs = Number(updatedAt) * 1000;
    if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
      return {
        status: "ok",
        priceUsd,
        roundId,
        blockNumber: Number(blockNumber),
        updatedAtMs: Number.NaN,
      };
    }
    return {
      status: "ok",
      priceUsd,
      roundId,
      blockNumber: Number(blockNumber),
      updatedAtMs,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message.slice(0, 160) : "Unknown RPC error.",
    };
  }
}

export interface OracleBadgeProps {
  /**
   * Fires when a fresh oracle price has been read successfully. The
   * second argument is the round's updatedAt, so the lab can label a
   * synced price with when the oracle actually answered.
   */
  onPrice?: (priceUsd: number, updatedAtMs?: number) => void;
  className?: string;
}

/**
 * Live Mezo testnet BTC/USD read-out with explicit states: fresh,
 * stale, or failed. This card never invents a price; when the RPC is
 * unreachable it says so and the manual input keeps working.
 */
export function MezoOracleBadge({ onPrice, className }: OracleBadgeProps) {
  const [state, setState] = useState<OracleState>({ status: "idle" });
  // Ticking clock so "x min ago" stays truthful while the page is open.
  // Reads only inside effects: a prerendered shell must not capture a
  // build-time timestamp.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // The relative-age label starts with the first tick; the mount read
    // below already stamps now when it succeeds. Pre-rendering shells
    // must not capture a build-time Date.now().
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    const next = await fetchMezoBtcPriceAsync();
    setState(next);
    setNow(Date.now());
    if (next.status === "ok") onPrice?.(next.priceUsd, next.updatedAtMs);
  }, [onPrice]);

  useEffect(() => {
    // Single read on mount, deferred out of the render/effect phase; the
    // refresh button serves later reads. Polling would just burn RPC calls.
    const t = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const stale =
    state.status === "ok" &&
    now !== null &&
    Number.isFinite(state.updatedAtMs) &&
    now - state.updatedAtMs > STALE_MS;

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
      {state.status === "idle" && (
        <p className="text-xs text-ink-faint">No reading yet.</p>
      )}
      {state.status === "ok" && (
        <>
          <p className="tabular text-sm text-ink-soft">
            ${state.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-ink-faint">
            Round {String(state.roundId)} at block {state.blockNumber}.
          </p>
          <p
            className={`text-[11px] ${
              stale || !Number.isFinite(state.updatedAtMs) ? "text-amber" : "text-ink-faint"
            }`}
          >
            {Number.isFinite(state.updatedAtMs) && now !== null ? (
              <>
                Oracle last updated {dateTime(state.updatedAtMs)} ({timeAgo(state.updatedAtMs, now)}).
                {stale && " This reading is stale. Check before trusting it."}
              </>
            ) : (
              "The oracle did not report an update time for this round."
            )}
          </p>
        </>
      )}
      {state.status === "error" && (
        <p className="text-xs text-risk">
          Oracle read failed ({state.message}). No price is invented; your manual
          input still works.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Read-only call to the Skip aggregator{" "}
        <code className="break-all tabular">{MEZO_TESTNET.btcUsdAggregator}</code> over{" "}
        <code className="tabular">rpc.test.mezo.org</code>. Per Mezo docs, this feed
        updates every block. Nothing else is fetched, and oracle values are always
        shown separately from prices you type by hand.
      </p>
    </div>
  );
}
