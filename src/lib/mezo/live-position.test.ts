import { describe, expect, it } from "vitest";

import { MEZO_MAINNET, MEZO_TESTNET } from "./verified";
import {
  accruedInterestSinceUpdate,
  decodeEntireDebtAndColl,
  decodeTroveRecord,
  fetchLiveTrove,
  liveTroveToPositionInput,
  totalCollateralWei,
  totalDebtWei,
  troveStatusLabel,
  weiToTokens,
  type MezoReadClient,
} from "./live-position";
import { MEZO_TROVE_MANAGER_ABI } from "./live-position";

interface FakeOptions {
  chainId?: number;
  throwOnChainId?: boolean;
  entire?: unknown;
  record?: unknown;
  status?: unknown;
  blockNumber?: bigint;
  throwOn?: "getEntireDebtAndColl" | "getTroveStatus" | "Troves";
}

/**
 * Values observed live on Mezo mainnet 2026-10-26 for the real active
 * trove 0x593c427d8C7bf5C555Ed41cd7CB7cCe8C9F15bB5 (getEntireDebtAndColl)
 * plus its Troves(address) struct: interestRate 100 bps, stored
 * interestOwed 923494883711418051 wei, entire-interest 2715150538016125673 wei.
 */
const REAL_ENTIRE = [
  16589214289854621112n,
  14486902024562555872608n,
  2715150538016125673n,
  0n,
  0n,
  0n,
] as const;

const REAL_RECORD = [
  16589214289854621112n,
  14486902024562555872608n,
  923494883711418051n,
  16589214289854621112n,
  1,
  100n,
  1792633348n,
  2843300271501650845721964n,
  0n,
] as unknown[];

function makeClient(options: FakeOptions = {}): MezoReadClient {
  return {
    getChainId: async () => {
      if (options.throwOnChainId) throw new Error("network error");
      return options.chainId ?? MEZO_MAINNET.chainId;
    },
    getBlockNumber: async () => options.blockNumber ?? 12780259n,
    readContract: async (args: { functionName: string }) => {
      if (
        options.throwOn &&
        options.throwOn === args.functionName
      ) {
        throw new Error("execution reverted");
      }
      if (args.functionName === "getEntireDebtAndColl") return options.entire ?? [...REAL_ENTIRE];
      if (args.functionName === "getTroveStatus") return options.status ?? 1;
      if (args.functionName === "Troves") return options.record ?? [...REAL_RECORD];
      if (args.functionName === "MCR") return 1100000000000000000n;
      throw new Error(`unexpected call ${String(args.functionName)}`);
    },
  } as unknown as MezoReadClient;
}

const REAL_BORROWER = "0x593c427d8C7bf5C555Ed41cd7CB7cCe8C9F15bB5";

describe("unit conversions", () => {
  it("converts 18-decimal wei values into whole BTC and MUSD amounts", () => {
    expect(weiToTokens(16589214289854621112n)).toBeCloseTo(16.589214289, 6);
    expect(weiToTokens(14486902024562555872608n)).toBeCloseTo(14486.902024, 4);
    expect(weiToTokens(0n)).toBe(0);
  });

  it("treats the same 18-decimal base for both BTC collateral and MUSD debt", () => {
    // Same wei magnitude conversions make cross-field mixups visible.
    expect(weiToTokens(1_000_000_000_000_000_000n)).toBe(1);
  });
});

describe("trove decoding (actual contract semantics)", () => {
  it("decodes getEntireDebtAndColl into the six raw fields", () => {
    const amounts = decodeEntireDebtAndColl([...REAL_ENTIRE]);
    expect(amounts.collWei).toBe(REAL_ENTIRE[0]);
    expect(amounts.principalWei).toBe(REAL_ENTIRE[1]);
    expect(amounts.interestWei).toBe(REAL_ENTIRE[2]);
    expect(amounts.pendingCollateralWei).toBe(0n);
    expect(amounts.pendingPrincipalWei).toBe(0n);
    expect(amounts.pendingInterestWei).toBe(0n);
  });

  it("computes total debt as principal + interest, per getTroveDebt semantics", () => {
    const amounts = decodeEntireDebtAndColl([...REAL_ENTIRE]);
    // Fetched live: getTroveDebt returned exactly principal + interest.
    expect(totalDebtWei(amounts)).toBe(14489617175100571998281n);
  });

  it("uses coll as effective collateral — never coll + pendingCollateral", () => {
    const amounts = decodeEntireDebtAndColl([
      100n, 50n, 10n, 7n, 3n, 2n,
    ]);
    expect(totalCollateralWei(amounts)).toBe(100n);
    expect(totalDebtWei(amounts)).toBe(60n);
  });

  it("decodes the Troves(address) struct and extracts the fixed rate", () => {
    const record = decodeTroveRecord(REAL_RECORD);
    expect(record.interestOwedStoredWei).toBe(923494883711418051n);
    expect(record.interestRateBps).toBe(100); // live: fixed 1.00% per-trove rate
    expect(record.lastInterestUpdateTimeSec).toBe(1792633348n);
    expect(record.recordStatus).toBe(1);
    expect(record.stakeWei).toBe(16589214289854621112n);
  });

  it("computes accrued-since-update interest as the difference between the two reads", () => {
    const amounts = decodeEntireDebtAndColl([...REAL_ENTIRE]);
    const record = decodeTroveRecord(REAL_RECORD);
    const merged = {
      ...amounts,
      interestOwedStoredWei: record.interestOwedStoredWei,
    };
    expect(merged.interestWei).toBe(2715150538016125673n);
    expect(accruedInterestSinceUpdate(merged)).toBe(
      2715150538016125673n - 923494883711418051n,
    );
  });

  it("returns null for an impossible interest ordering instead of a negative", () => {
    const amounts = decodeEntireDebtAndColl([...REAL_ENTIRE]);
    expect(
      accruedInterestSinceUpdate({
        ...amounts,
        interestWei: 5n,
        interestOwedStoredWei: 6n,
      }),
    ).toBeNull();
  });

  it("rejects malformed getEntireDebtAndColl responses as decode failures", () => {
    expect(() => decodeEntireDebtAndColl([])).toThrow(/expected 6/);
    expect(() => decodeEntireDebtAndColl([1n, 2n])).toThrow(/expected 6/);
    expect(() => decodeEntireDebtAndColl("junk")).toThrow(/unexpected/);
    expect(() =>
      decodeEntireDebtAndColl([1n, 2n, 3n, "4", 5n, 6n]),
    ).toThrow(/pendingCollateral/);
  });

  it("rejects malformed Troves(address) responses as decode failures", () => {
    expect(() => decodeTroveRecord([1n])).toThrow(/expected 9/);
    expect(() =>
      decodeTroveRecord(
        [1n, 2n, 3n, 4n, 1.5, 5n, 6n, 7n, 8n],
      ),
    ).toThrow(/status/);
    // 99 is a valid (if unknown) uint8 status and must decode, not throw.
    expect(
      decodeTroveRecord([1n, 2n, 3n, 4n, 99, 5n, 6n, 7n, 8n]).recordStatus,
    ).toBe(99);
  });

  it("exposes the documented status labels", () => {
    expect(troveStatusLabel(0)).toBe("nonExistent");
    expect(troveStatusLabel(1)).toBe("active");
    expect(troveStatusLabel(3)).toBe("closedByLiquidation");
    expect(troveStatusLabel(9)).toMatch(/unknown/);
  });
});

describe("pending rewards", () => {
  it("surfaces pending redistributed collateral/principal/interest when nonzero", () => {
    const amounts = decodeEntireDebtAndColl([
      110n, 60n, 15n, 10n, 5n, 2n,
    ]);
    expect(amounts.pendingCollateralWei).toBe(10n);
    expect(amounts.pendingPrincipalWei).toBe(5n);
    expect(amounts.pendingInterestWei).toBe(2n);
    // coll already includes pendingCollateral (110, not 120); debt must
    // still be principal + interest (75), never double-added.
    expect(totalCollateralWei(amounts)).toBe(110n);
    expect(totalDebtWei(amounts)).toBe(75n);
  });
});

describe("fetchLiveTrove", () => {
  it("reads a real active trove into a fillable engine input", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient(),
      REAL_BORROWER,
    );
    expect(reading.kind).toBe("active");
    if (reading.kind !== "active") return;
    expect(reading.status).toBe(1);
    expect(reading.blockNumber).toBe(12780259);
    expect(reading.chainId).toBe(31612);
    const input = liveTroveToPositionInput(
      reading.amounts,
      79572.7058,
    );
    expect(input).not.toBeNull();
    if (!input) return;
    expect(input.btcCollateral).toBeCloseTo(16.589214289, 6);
    expect(input.musdDebt).toBeCloseTo(14489.617175, 3);
    expect(input.btcPriceUsd).toBe(79572.7058);
  });

  it("reports an address with no trove as EMPTY, not as an error", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      // status 0 (nonExistent) is what the chain returns for a virgin address.
      makeClient({ status: 0, entire: [0n, 0n, 0n, 0n, 0n, 0n], record: [0n, 0n, 0n, 0n, 0, 0n, 0n, 0n, 0n] }),
      "0x1111111111111111111111111111111111111111",
    );
    expect(reading.kind).toBe("empty");
    if (reading.kind === "empty") {
      expect(reading.blockNumber).toBe(12780259);
      expect(reading.chainId).toBe(31612);
    }
  });

  it("reports closed troves with their status label", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient({ status: 4 }),
      REAL_BORROWER,
    );
    expect(reading.kind).toBe("closed");
    if (reading.kind === "closed") {
      expect(reading.statusLabel).toBe("closedByRedemption");
      expect(reading.status).toBe(4);
    }
  });

  it("aborts with a chain-mismatch error when the RPC answers another chain", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient({ chainId: MEZO_TESTNET.chainId }),
      REAL_BORROWER,
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") {
      expect(reading.stage).toBe("chain-mismatch");
      expect(reading.message).toContain("31611");
    }
  });

  it("returns an rpc error when the chain id call fails", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient({ throwOnChainId: true }),
      REAL_BORROWER,
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") expect(reading.stage).toBe("rpc");
  });

  it("returns an rpc error when the TroveManager call reverts", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient({ throwOn: "getEntireDebtAndColl" }),
      REAL_BORROWER,
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") {
      expect(reading.stage).toBe("rpc");
      expect(reading.message).toMatch(/execution reverted/);
    }
  });

  it("returns a decode error (not a fake position) on a undecodable response", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient({ entire: [1n, 2n, 3n] }),
      REAL_BORROWER,
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") {
      expect(reading.stage).toBe("decode");
      expect(reading.message).toMatch(/expected 6/);
    }
  });

  it("rejects a non-address input before making any call", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient(),
      "not-an-address",
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") expect(reading.stage).toBe("invalid-address");
  });
});

describe("live position → risk engine", () => {
  it("feeds the real trove into the engine without breaking hypothetical flow", async () => {
    const reading = await fetchLiveTrove(
      MEZO_MAINNET,
      makeClient(),
      REAL_BORROWER,
    );
    if (reading.kind !== "active") throw new Error("fixture failed");
    const input = liveTroveToPositionInput(reading.amounts, 79572.7058);
    if (!input) throw new Error("conversion failed");
    // The ratio math must hold: collateral value / total debt. The real
    // trove is very safe: ~$1.32M collateral vs ~$14.49k debt → ~91×.
    const collateralValue = input.btcCollateral * input.btcPriceUsd;
    const ratio = collateralValue / input.musdDebt;
    expect(ratio).toBeGreaterThan(50);
    expect(ratio).toBeCloseTo(91.11, 1);
  });

  it("returns null when amounts are zero or the price is unusable", () => {
    const amounts = decodeEntireDebtAndColl([0n, 0n, 0n, 0n, 0n, 0n]);
    expect(liveTroveToPositionInput(amounts, 79572.7058)).toBeNull();
    const filled = decodeEntireDebtAndColl([...REAL_ENTIRE]);
    expect(liveTroveToPositionInput(filled, 0)).toBeNull();
    expect(liveTroveToPositionInput(filled, Number.NaN)).toBeNull();
  });

  it("exposes the full verified ABI including MCR for threshold checks", () => {
    const names = MEZO_TROVE_MANAGER_ABI.map((f) => f.name);
    expect(names).toContain("getEntireDebtAndColl");
    expect(names).toContain("getTroveStatus");
    expect(names).toContain("Troves");
    expect(names).toContain("MCR");
  });
});
