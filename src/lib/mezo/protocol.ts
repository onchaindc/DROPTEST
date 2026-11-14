/**
 * Live Mezo protocol-level reads.
 *
 * These are the four view calls that describe the *system* rather than
 * one trove. All four selectors were verified against live Mezo mainnet
 * before shipping (2026-11-14, block at read time):
 *
 * - `TroveManager.MCR()`               → 1.1e18  (the documented 110% MCR)
 * - `TroveManager.getTCR(uint256)`     → 3.8e19  (system TCR at the supplied price)
 * - `BorrowerOperations.borrowingRate()` → 0.001e18 (the documented 0.1% fee)
 * - `BorrowerOperations.redemptionRate()` → 0.0075e18 (the documented 0.75% fee)
 *
 * `getTCR` takes the BTC price as an argument (the docs' redemption
 * guide instructs integrators to call it with the current price), so
 * the caller supplies a price it already trusts — normally the Skip
 * oracle reading — and this module never invents one. No-argument
 * `getTCR()` reverts on mainnet, which is why the signature is pinned.
 *
 * Failure taxonomy matches the rest of `@/lib/mezo`: chain mismatch,
 * RPC failure, and structurally unusable answers are separate, typed
 * errors. A system TCR of zero (no troves) is reported as unavailable
 * rather than as 0%.
 */
import { parseAbi } from "viem";

import type { MezoNetwork } from "./verified";
import { SYSTEM_RECOVERY_MODE_TCR_PCT } from "./verified";
import type { MezoReadClient } from "./oracle";

export const MEZO_PROTOCOL_ABI = parseAbi([
  "function MCR() view returns (uint256)",
  "function getTCR(uint256 _price) view returns (uint256)",
  "function borrowingRate() view returns (uint256)",
  "function redemptionRate() view returns (uint256)",
]);

export const MEZO_PROTOCOL_SOURCE = "https://mezo.org/docs/users/musd/fees";
export const MEZO_TCR_SOURCE =
  "https://mezo.org/docs/developers/musd/musd-redemptions";
export const MEZO_TROVE_MANAGER_CONTRACT_SOURCE =
  "https://github.com/mezo-org/musd/blob/main/solidity/contracts/TroveManager.sol";

export type ProtocolSnapshot =
  | {
      kind: "ok";
      chainId: number;
      blockNumber: number;
      /** MCR read from the chain, in percent (110). */
      mcrPct: number;
      /** System total collateral ratio at the supplied price, in percent. */
      tcrPct: number;
      /** Live borrowing (issuance) rate, in percent (0.1). */
      borrowingFeePct: number;
      /** Live redemption rate, in percent (0.75). */
      redemptionFeePct: number;
      /** Price supplied by the caller and used for getTCR. */
      priceUsdUsed: number;
      /** True when TCR is below the documented 150% Recovery Mode trigger. */
      recoveryMode: boolean;
      /** Docs: redemptions require TCR to be at or above MCR. */
      redemptionsOpen: boolean;
    }
  | {
      kind: "error";
      stage: "chain-mismatch" | "rpc" | "decode";
      message: string;
    };

/** Convert a 1e18-scaled rate from the chain into percent. */
export function rateWeiToPct(wei: bigint): number | null {
  if (typeof wei !== "bigint" || wei < 0n) return null;
  const pct = Number(wei) / 1e16;
  return Number.isFinite(pct) && pct >= 0 ? pct : null;
}

/** Convert a human USD price into an 18-decimal wei argument. */
export function priceUsdToWei18(priceUsd: number): bigint | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return BigInt(Math.round(priceUsd * 1e6)) * 10n ** 12n;
}

/**
 * Recovery Mode: system TCR below the documented 150% trigger. This is
 * a market-level condition and is never a per-position liquidation line.
 */
export function isRecoveryMode(tcrPct: number): boolean {
  return Number.isFinite(tcrPct) && tcrPct < SYSTEM_RECOVERY_MODE_TCR_PCT;
}

/**
 * Redemptions can only run while the system TCR is at or above the MCR
 * (the docs: "Cannot redeem when TCR < MCR").
 */
export function areRedemptionsOpen(tcrPct: number, mcrPct: number): boolean {
  return (
    Number.isFinite(tcrPct) &&
    Number.isFinite(mcrPct) &&
    mcrPct > 0 &&
    tcrPct >= mcrPct
  );
}

/** Read all four protocol values from `network`, after the chain guard. */
export async function fetchProtocolSnapshot(
  network: MezoNetwork,
  client: MezoReadClient,
  btcPriceUsd: number,
): Promise<ProtocolSnapshot> {
  const priceWei = priceUsdToWei18(btcPriceUsd);
  if (priceWei === null) {
    return {
      kind: "error",
      stage: "decode",
      message: "A positive BTC/USD price is required to read the system collateral ratio.",
    };
  }

  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (err) {
    return { kind: "error", stage: "rpc", message: rpcMessage(err) };
  }
  if (chainId !== network.chainId) {
    return {
      kind: "error",
      stage: "chain-mismatch",
      message: `RPC answered chain id ${chainId}, expected ${network.chainId} (${network.label}). Read aborted so no cross-network data is shown.`,
    };
  }

  try {
    const [mcrWei, tcrWei, borrowingWei, redemptionWei, blockNumber] =
      await Promise.all([
        client.readContract({
          address: network.contracts.troveManager,
          abi: MEZO_PROTOCOL_ABI,
          functionName: "MCR",
        }),
        client.readContract({
          address: network.contracts.troveManager,
          abi: MEZO_PROTOCOL_ABI,
          functionName: "getTCR",
          args: [priceWei],
        }),
        client.readContract({
          address: network.contracts.borrowerOperations,
          abi: MEZO_PROTOCOL_ABI,
          functionName: "borrowingRate",
        }),
        client.readContract({
          address: network.contracts.borrowerOperations,
          abi: MEZO_PROTOCOL_ABI,
          functionName: "redemptionRate",
        }),
        client.getBlockNumber(),
      ]);

    const mcrPct = rateWeiToPct(mcrWei);
    const tcrPct = rateWeiToPct(tcrWei);
    const borrowingFeePct = rateWeiToPct(borrowingWei);
    const redemptionFeePct = rateWeiToPct(redemptionWei);

    if (mcrPct === null || mcrPct <= 0) {
      return {
        kind: "error",
        stage: "decode",
        message: "MCR() did not decode to a positive percentage.",
      };
    }
    if (tcrPct === null || tcrPct <= 0) {
      return {
        kind: "error",
        stage: "decode",
        message:
          "getTCR() did not decode to a positive percentage. A zero system ratio means the system holds no debt, so no percentage can be shown.",
      };
    }
    if (borrowingFeePct === null || borrowingFeePct >= 100) {
      return {
        kind: "error",
        stage: "decode",
        message: "borrowingRate() did not decode to a usable percentage.",
      };
    }
    if (redemptionFeePct === null || redemptionFeePct >= 100) {
      return {
        kind: "error",
        stage: "decode",
        message: "redemptionRate() did not decode to a usable percentage.",
      };
    }

    return {
      kind: "ok",
      chainId,
      blockNumber: Number(blockNumber),
      mcrPct,
      tcrPct,
      borrowingFeePct,
      redemptionFeePct,
      priceUsdUsed: btcPriceUsd,
      recoveryMode: isRecoveryMode(tcrPct),
      redemptionsOpen: areRedemptionsOpen(tcrPct, mcrPct),
    };
  } catch (err) {
    return { kind: "error", stage: "rpc", message: rpcMessage(err) };
  }
}

function rpcMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "Unknown RPC error.";
}
