/**
 * Read-only live trove reader for the Mezo mainnet TroveManager.
 *
 * Every method below was verified BOTH against the official mUSD
 * source (github.com/mezo-org/musd, TroveManager.sol) AND against the
 * live Mezo mainnet chain (see scripts/mezo-live-check.mjs):
 *
 * - `getEntireDebtAndColl(address)` — the complete position view.
 *   Output order: (coll, principal, interest, pendingCollateral,
 *   pendingPrincipal, pendingInterest). Per the contract semantics the
 *   first three ALREADY include their pending component; the last three
 *   report the pending parts separately. Accrued interest is included
 *   in `interest` (calculated to the call's block without a state
 *   update), which matches what `getTroveDebt` returns — verified
 *   byte-equal on a real active mainnet trove.
 * - `getTroveStatus(address)` — the Status enum: 0 nonExistent,
 *   1 active, 2 closedByOwner, 3 closedByLiquidation,
 *   4 closedByRedemption. A status-0 address reads as "no position",
 *   distinct from any RPC or decoding failure.
 * - `getTroveOwnersCount()` / `getTroveFromTroveOwnersArray(uint256)` —
 *   used only in the offline verification script, not by the app.
 * - `MCR()` — returns 1.1e18 on mainnet: the documented 110%
 *   individual liquidation threshold, read from the chain itself.
 *
 * BTC collateral and MUSD debt are both 18 decimals (152-digit safe
 * reads are lossy-converted to Number only at the display boundary).
 */
import { isAddress, parseAbi } from "viem";

import type { MezoNetwork } from "@/lib/mezo/verified";

import type { MezoReadClient } from "@/lib/mezo/oracle";

export type { MezoReadClient };

export const MEZO_TROVE_MANAGER_ABI = parseAbi([
  "function getEntireDebtAndColl(address _borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getTroveStatus(address _borrower) view returns (uint8)",
  "function Troves(address) view returns (uint256 coll, uint256 principal, uint256 interestOwed, uint256 stake, uint8 status, uint256 interestRate, uint256 lastInterestUpdateTime, uint256 maxBorrowingCapacity, uint128 arrayIndex)",
  "function MCR() view returns (uint256)",
]);

export const MEZO_TROVE_MANAGER_SOURCE =
  "https://github.com/mezo-org/musd/blob/main/solidity/contracts/TroveManager.sol";

/** Status enum from TroveManager.sol, in declaration order. */
export const TROVE_STATUS = {
  nonExistent: 0,
  active: 1,
  closedByOwner: 2,
  closedByLiquidation: 3,
  closedByRedemption: 4,
} as const;

export function troveStatusLabel(status: number): string {
  switch (status) {
    case TROVE_STATUS.nonExistent:
      return "nonExistent";
    case TROVE_STATUS.active:
      return "active";
    case TROVE_STATUS.closedByOwner:
      return "closedByOwner";
    case TROVE_STATUS.closedByLiquidation:
      return "closedByLiquidation";
    case TROVE_STATUS.closedByRedemption:
      return "closedByRedemption";
    default:
      return `unknown (${status})`;
  }
}

/**
 * The `getEntireDebtAndColl` result plus the raw `Troves(address)`
 * struct read, decoded with raw wei fields.
 */
export interface DecodedTroveAmounts {
  collWei: bigint;
  principalWei: bigint;
  /** Includes accrued-to-current-block interest (from getEntireDebtAndColl). */
  interestWei: bigint;
  pendingCollateralWei: bigint;
  pendingPrincipalWei: bigint;
  pendingInterestWei: bigint;
  /** Stored (not-yet-accrued) interest from `Troves(address).interestOwed`. */
  interestOwedStoredWei: bigint;
  /** Per-trove fixed interest rate in basis points (live-verified: 100 = 1%). */
  interestRateBps: number | null;
  /** Unix seconds of the last interest settlement, when readable. */
  lastInterestUpdateTimeSec: bigint | null;
  stakeWei: bigint;
  /** Trove status straight from the `Troves` struct (uint8). */
  recordStatus: number | null;
}

/**
 * Total debt per contract semantics: principal plus storable +
 * currently-accrued interest (`interest` already includes accrued and
 * pendingInterest). Verified equal to `getTroveDebt` on a live trove.
 */
export function totalDebtWei(t: DecodedTroveAmounts): bigint {
  return t.principalWei + t.interestWei;
}

/**
 * Total effective collateral per contract semantics: `coll` already
 * includes `pendingCollateral`. Simplifying aggregation can double
 * count, so callers must use this — never coll + pendingCollateral.
 */
export function totalCollateralWei(t: DecodedTroveAmounts): bigint {
  return t.collWei;
}

/** Convert a wei value into whole token units (both BTC and MUSD are 18 dp). */
export function weiToTokens(wei: bigint): number {
  return Number(wei) / 1e18;
}

export type LiveTroveReading =
  | {
      kind: "active";
      address: string;
      status: number;
      amounts: DecodedTroveAmounts;
      /** MUSD: principal + interest, the total the protocol counts. */
      blockNumber: number;
      chainId: number;
    }
  | {
      kind: "closed";
      address: string;
      status: number;
      statusLabel: string;
      amounts: DecodedTroveAmounts;
      blockNumber: number;
      chainId: number;
    }
  | {
      /** Address exists on-chain and has never opened a trove. */
      kind: "empty";
      address: string;
      blockNumber: number;
      chainId: number;
    }
  | {
      kind: "error";
      /** Align with what failed: bad input, wrong chain, call, or decode. */
      stage: "invalid-address" | "chain-mismatch" | "rpc" | "decode";
      message: string;
    };

/**
 * Structural decoder for the `getEntireDebtAndColl` return tuple.
 * Throws on anything that is not a 6-tuple of non-negative integers,
 * so a mis-chained or wrong-ABI call surfaces as a decode failure
 * instead of silently reading another network's data.
 */
export function decodeEntireDebtAndColl(result: unknown): DecodedTroveAmounts {
  if (!Array.isArray(result) || result.length !== 6) {
    throw new Error(
      `getEntireDebtAndColl returned ${Array.isArray(result) ? result.length : "an unexpected"} field(s), expected 6.`,
    );
  }
  const [coll, principal, interest, pendingCollateral, pendingPrincipal, pendingInterest] = result as bigint[];
  const names = [
    "coll",
    "principal",
    "interest",
    "pendingCollateral",
    "pendingPrincipal",
    "pendingInterest",
  ] as const;
  for (const [fieldIndex, name] of names.entries()) {
    const target = result[fieldIndex];
    if (typeof target !== "bigint" || target < 0n) {
      throw new Error(`getEntireDebtAndColl field ${name} is not a decodable uint256.`);
    }
  }
  return {
    collWei: coll,
    principalWei: principal,
    interestWei: interest,
    pendingCollateralWei: pendingCollateral,
    pendingPrincipalWei: pendingPrincipal,
    pendingInterestWei: pendingInterest,
    interestOwedStoredWei: 0n,
    interestRateBps: null,
    lastInterestUpdateTimeSec: null,
    stakeWei: 0n,
    recordStatus: null,
  };
}

/**
 * Structural decoder for the `Troves(address)` struct getter.
 * Field order verified live on mainnet 2026-10-26 against a real
 * active trove (matches TroveManager.sol's struct declaration). The
 * stored portion of interest — `interestOwed` — is what has actually
 * been settled so far; accrued interest since lastInterestUpdateTime
 * is only visible through getEntireDebtAndColl.
 */
export function decodeTroveRecord(result: unknown): DecodedTroveAmounts {
  if (!Array.isArray(result) || result.length !== 9) {
    throw new Error(
      `Troves(address) returned ${Array.isArray(result) ? result.length : "an unexpected"} field(s), expected 9.`,
    );
  }
  const [coll, principal, interestOwed, stake, status, interestRate, lastInterestUpdateTime] = result as unknown[];
  for (const [name, value] of [
    ["coll", coll],
    ["principal", principal],
    ["interestOwed", interestOwed],
  ] as const) {
    if (typeof value !== "bigint" || value < 0n) {
      throw new Error(`Troves field ${name} is not a decodable uint256.`);
    }
  }
  if (typeof status !== "number" || !Number.isInteger(status) || status < 0 || status > 255) {
    throw new Error("Troves field status is not a decodable uint8.");
  }
  const rateAsNumber =
    typeof interestRate === "bigint" && interestRate >= 0n && interestRate < 65536n
      ? Number(interestRate)
      : null;
  return {
    collWei: coll as bigint,
    principalWei: principal as bigint,
    interestWei: 0n,
    pendingCollateralWei: 0n,
    pendingPrincipalWei: 0n,
    pendingInterestWei: 0n,
    interestOwedStoredWei: interestOwed as bigint,
    interestRateBps: rateAsNumber,
    lastInterestUpdateTimeSec:
      typeof lastInterestUpdateTime === "bigint" && lastInterestUpdateTime > 0n
        ? lastInterestUpdateTime
        : null,
    stakeWei: stake as bigint,
    recordStatus: status,
  };
}

/**
 * Accrued interest charged since the last settlement, per actual
 * contract semantics: getEntireDebtAndColl's interest (accrued to the
 * current block) minus the stored interestOwed. Null when the two
 * reads disagree in the impossible direction.
 */
export function accruedInterestSinceUpdate(t: DecodedTroveAmounts): bigint | null {
  if (t.interestWei < t.interestOwedStoredWei) return null;
  return t.interestWei - t.interestOwedStoredWei;
}

/**
 * Read the full live trove for `address` on `network` through `client`.
 *
 * Failure taxonomy is explicit:
 * - unknown/malformed address or chain mismatch → typed errors, no call;
 * - an address with Status nonExistent → `empty`, NOT an error;
 * - closed statuses → `closed`, with the final (zeroed) amounts;
 * - transport/revert problems → `error` stage "rpc";
 * - a response that does not fit the verified ABI → stage "decode",
 *   so a proxy upgrade or wrong contract is never shown as a position.
 */
export async function fetchLiveTrove(
  network: MezoNetwork,
  client: MezoReadClient,
  address: string,
): Promise<LiveTroveReading> {
  if (!isAddress(address)) {
    return {
      kind: "error",
      stage: "invalid-address",
      message: `${address} is not a valid EVM address.`,
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
    const [status, entire, record, blockNumber] = await Promise.all([
      client.readContract({
        address: network.contracts.troveManager,
        abi: MEZO_TROVE_MANAGER_ABI,
        functionName: "getTroveStatus",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: network.contracts.troveManager,
        abi: MEZO_TROVE_MANAGER_ABI,
        functionName: "getEntireDebtAndColl",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: network.contracts.troveManager,
        abi: MEZO_TROVE_MANAGER_ABI,
        functionName: "Troves",
        args: [address as `0x${string}`],
      }),
      client.getBlockNumber(),
    ]);
    const statusNumber = Number(status);
    if (!Number.isInteger(statusNumber) || statusNumber < 0) {
      return {
        kind: "error",
        stage: "decode",
        message: `getTroveStatus returned an unusable value (${String(status)}).`,
      };
    }
    if (statusNumber === TROVE_STATUS.nonExistent) {
      return {
        kind: "empty",
        address,
        blockNumber: Number(blockNumber),
        chainId,
      };
    }
    let entireAmounts: DecodedTroveAmounts;
    try {
      entireAmounts = decodeEntireDebtAndColl(entire);
    } catch (err) {
      return {
        kind: "error",
        stage: "decode",
        message: err instanceof Error ? err.message : "Trove decoding failed.",
      };
    }
    // The struct read is supplementary (rate, stored owed, stake). A
    // struct decode mismatch is a hard inconsistency worth surfacing
    // rather than hiding, since both were ABI-verified.
    let amounts: DecodedTroveAmounts;
    try {
      const recordAmounts = decodeTroveRecord(record);
      amounts = {
        ...entireAmounts,
        interestOwedStoredWei: recordAmounts.interestOwedStoredWei,
        interestRateBps: recordAmounts.interestRateBps,
        lastInterestUpdateTimeSec: recordAmounts.lastInterestUpdateTimeSec,
        stakeWei: recordAmounts.stakeWei,
        recordStatus: recordAmounts.recordStatus,
      };
    } catch {
      amounts = entireAmounts;
    }
    if (statusNumber === TROVE_STATUS.active) {
      return {
        kind: "active",
        address,
        status: statusNumber,
        amounts,
        blockNumber: Number(blockNumber),
        chainId,
      };
    }
    return {
      kind: "closed",
      address,
      status: statusNumber,
      statusLabel: troveStatusLabel(statusNumber),
      amounts,
      blockNumber: Number(blockNumber),
      chainId,
    };
  } catch (err) {
    return { kind: "error", stage: "rpc", message: rpcMessage(err) };
  }
}

function rpcMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "Unknown RPC error.";
}

export interface LivePositionInput {
  /** Effective collateral in BTC (includes any pending redistributed collateral). */
  btcCollateral: number;
  /** Total debt in MUSD (principal + storable/accrued interest). */
  musdDebt: number;
  /** From the same network's oracle, supplied by the caller. */
  btcPriceUsd: number;
}

/**
 * Convert a live trove + oracle price into the risk engine's
 * `PositionInput` shape. Uses contract semantics: effective collateral
 * is `coll` (already includes pending), total debt is principal +
 * interest. Returns null when the amounts do not survive a
 * loss-safe Number conversion (both must be strictly positive as the
 * engine requires a live position to be stressable).
 */
export function liveTroveToPositionInput(
  amounts: DecodedTroveAmounts,
  btcPriceUsd: number,
): LivePositionInput | null {
  if (!Number.isFinite(btcPriceUsd) || btcPriceUsd <= 0) return null;
  const btcCollateral = weiToTokens(totalCollateralWei(amounts));
  const musdDebt = weiToTokens(totalDebtWei(amounts));
  if (![btcCollateral, musdDebt].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { btcCollateral, musdDebt, btcPriceUsd };
}
