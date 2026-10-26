/**
 * Read-only BTC/USD oracle reader for a Mezo network.
 *
 * Talks to the documented Skip BTC/USD aggregator through the supplied
 * client. Every read is specific to one `MezoNetwork` — the caller never
 * passes bare addresses. Nothing here invents a price: failures are
 * returned as typed errors, and a stale reading is flagged, not used
 * silently.
 */
import { parseAbi } from "viem";

import type { MezoNetwork } from "@/lib/mezo/verified";

import type { MezoClient } from "@/lib/mezo/client";

/**
 * Aggregator ABI slice, only what DROPTEST reads. `latestRoundData` on
 * the Skip BTC/USD feed follows the Chainlink AggregatorV3 shape; the
 * deployed feed returns 18-decimal answers (NOT Chainlink's usual 8),
 * so `decimals()` is always read from the chain, never assumed.
 */
const AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

/**
 * Per Mezo docs the Skip feeds "update frequency: every block", so any
 * reading materially older than a few minutes is not live data. 10
 * minutes is generous enough not to flag a just-polling reader while
 * still catching a feed that stopped landing updates.
 */
export const ORACLE_STALE_MS = 10 * 60 * 1000;

export type OracleReading =
  | {
      kind: "ok";
      /** Human price: answer scaled by the on-chain `decimals()`. */
      priceUsd: number;
      /** Raw aggregator answer, unconverted. */
      answerWei: bigint;
      /** `decimals()` as read from the chain. */
      decimals: number;
      /** `updatedAt` in milliseconds (0 means the field was unusable). */
      updatedAtMs: number;
      /** True when `updatedAt` is older than ORACLE_STALE_MS. */
      stale: boolean;
      roundId: bigint;
      blockNumber: number;
      /** Chain id the client reported — always checked against `network`. */
      chainId: number;
    }
  | {
      kind: "error";
      /** Where it failed: the chain guard, the call, or the answer's shape. */
      stage: "chain-mismatch" | "rpc" | "invalid-price";
      message: string;
    };

export type MezoReadClient = Pick<MezoClient, "getChainId" | "getBlockNumber" | "readContract">;

/**
 * Convert a raw aggregator answer to a USD number using the answer's
 * own decimals. Returns null for anything that would not be a usable
 * positive price (non-finite, non-positive, absurd decimals).
 */
export function answerToPriceUsd(answerWei: bigint, decimals: number): number | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const price = Number(answerWei) / 10 ** decimals;
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Human-readable explanation for an unusable reading, or null when the
 * answer, decimals, and updatedAt all look structurally valid.
 */
export function oracleInvalidReason(
  answerWei: bigint,
  decimals: number,
  updatedAtSec: bigint,
): string | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return `Oracle returned unusable decimals (${decimals}).`;
  }
  if (answerWei <= 0n) {
    return "Oracle returned a non-positive answer.";
  }
  if (updatedAtSec <= 0n) {
    return "Oracle did not report a usable update time.";
  }
  const price = answerToPriceUsd(answerWei, decimals);
  if (price === null || !Number.isFinite(price) || price <= 0) {
    return "Oracle answer cannot be scaled to a finite positive price.";
  }
  return null;
}

/** True when a reading's update time has passed the staleness limit. */
export function isOracleStale(updatedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return true;
  return nowMs - updatedAtMs > ORACLE_STALE_MS;
}

/**
 * Read the Skip BTC/USD aggregator on `network` through `client`.
 *
 * Order of operations, in deliberately strict order:
 *  1. Verify the connected chain id against the network definition —
 *     a mismatch is an explicit error, never a silent cross-network read.
 *  2. Read `decimals()`, `latestRoundData()`, and the current block.
 *  3. Reject structurally invalid answers (<= 0, unusable decimals, no
 *     update time) instead of surfacing a fabricated-looking number.
 *  4. Flag stale readings rather than hiding their age.
 */
export async function fetchBtcUsdPrice(
  network: MezoNetwork,
  client: MezoReadClient,
  nowMs: number = Date.now(),
): Promise<OracleReading> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (err) {
    return { kind: "error", stage: "rpc", message: chainIdErrorMessage(err) };
  }
  if (chainId !== network.chainId) {
    return {
      kind: "error",
      stage: "chain-mismatch",
      message: `RPC answered chain id ${chainId}, expected ${network.chainId} (${network.label}). Read aborted so no cross-network data is shown.`,
    };
  }
  try {
    const [decimals, round, blockNumber] = await Promise.all([
      client.readContract({
        address: network.contracts.btcUsdAggregator,
        abi: AGGREGATOR_ABI,
        functionName: "decimals",
      }),
      client.readContract({
        address: network.contracts.btcUsdAggregator,
        abi: AGGREGATOR_ABI,
        functionName: "latestRoundData",
      }),
      client.getBlockNumber(),
    ]);

    const answerWei = round[1];
    const updatedAtSec = round[3];
    const reason = oracleInvalidReason(answerWei, decimals, updatedAtSec);
    if (reason !== null) {
      return { kind: "error", stage: "invalid-price", message: reason };
    }

    const priceUsd = answerToPriceUsd(answerWei, decimals);
    if (priceUsd === null) {
      return {
        kind: "error",
        stage: "invalid-price",
        message: "Oracle answer cannot be scaled to a finite positive price.",
      };
    }

    const updatedAtMs = Number(updatedAtSec) * 1000;
    return {
      kind: "ok",
      priceUsd,
      answerWei,
      decimals,
      updatedAtMs,
      stale: isOracleStale(updatedAtMs, nowMs),
      roundId: round[0],
      blockNumber: Number(blockNumber),
      chainId,
    };
  } catch (err) {
    return { kind: "error", stage: "rpc", message: chainIdErrorMessage(err) };
  }
}

function chainIdErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "Unknown RPC error.";
}
