import { describe, expect, it } from "vitest";

import {
  areRedemptionsOpen,
  fetchProtocolSnapshot,
  isRecoveryMode,
  priceUsdToWei18,
  rateWeiToPct,
} from "./protocol";
import { MEZO_MAINNET, MEZO_TESTNET } from "./verified";
import type { MezoReadClient } from "./oracle";

const OK_VALUES: Record<string, bigint> = {
  MCR: 1_100_000_000_000_000_000n,
  getTCR: 38_158_937_250_183_658_060n,
  borrowingRate: 1_000_000_000_000_000n,
  redemptionRate: 7_500_000_000_000_000n,
};

function mockClient(options: {
  values?: Record<string, bigint>;
  chainId?: number;
  throwOn?: string;
} = {}): MezoReadClient {
  const values = { ...OK_VALUES, ...(options.values ?? {}) };
  return {
    getChainId: async () => {
      if (options.throwOn === "getChainId") throw new Error("RPC down");
      return options.chainId ?? MEZO_MAINNET.chainId;
    },
    getBlockNumber: async () => 12_345n,
    readContract: async (args: { functionName: string }) => {
      if (options.throwOn === args.functionName) throw new Error("reverted");
      return values[args.functionName];
    },
  } as unknown as MezoReadClient;
}

describe("fetchProtocolSnapshot", () => {
  it("reads MCR, TCR and both live rates", async () => {
    const snapshot = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient(),
      63_727.93,
    );
    expect(snapshot.kind).toBe("ok");
    if (snapshot.kind !== "ok") return;
    expect(snapshot.mcrPct).toBeCloseTo(110, 8);
    expect(snapshot.tcrPct).toBeCloseTo(3_815.8937250183658, 6);
    expect(snapshot.borrowingFeePct).toBeCloseTo(0.1, 10);
    expect(snapshot.redemptionFeePct).toBeCloseTo(0.75, 10);
    expect(snapshot.priceUsdUsed).toBe(63_727.93);
    expect(snapshot.chainId).toBe(MEZO_MAINNET.chainId);
    expect(snapshot.blockNumber).toBe(12_345);
    expect(snapshot.recoveryMode).toBe(false);
    expect(snapshot.redemptionsOpen).toBe(true);
  });

  it("aborts on a chain mismatch before decoding anything", async () => {
    const snapshot = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient({ chainId: MEZO_TESTNET.chainId }),
      63_727.93,
    );
    expect(snapshot).toEqual({
      kind: "error",
      stage: "chain-mismatch",
      message: expect.stringContaining(`${MEZO_MAINNET.chainId}`),
    });
  });

  it("surfaces transport failures as RPC errors", async () => {
    const snapshot = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient({ throwOn: "getChainId" }),
      63_727.93,
    );
    expect(snapshot.kind).toBe("error");
    if (snapshot.kind === "error") expect(snapshot.stage).toBe("rpc");

    const reverted = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient({ throwOn: "getTCR" }),
      63_727.93,
    );
    expect(reverted.kind).toBe("error");
    if (reverted.kind === "error") expect(reverted.stage).toBe("rpc");
  });

  it("rejects a zero MCR or zero TCR instead of showing 0%", async () => {
    const zeroMcr = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient({ values: { MCR: 0n } }),
      63_727.93,
    );
    expect(zeroMcr.kind).toBe("error");
    if (zeroMcr.kind === "error") expect(zeroMcr.stage).toBe("decode");

    const zeroTcr = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient({ values: { getTCR: 0n } }),
      63_727.93,
    );
    expect(zeroTcr.kind).toBe("error");
    if (zeroTcr.kind === "error") expect(zeroTcr.stage).toBe("decode");
  });

  it("requires a positive price for the TCR call", async () => {
    const snapshot = await fetchProtocolSnapshot(MEZO_MAINNET, mockClient(), 0);
    expect(snapshot.kind).toBe("error");
    if (snapshot.kind === "error") expect(snapshot.stage).toBe("decode");
  });

  it("flags Recovery Mode when TCR is below 150%", async () => {
    const snapshot = await fetchProtocolSnapshot(
      MEZO_MAINNET,
      mockClient({ values: { getTCR: 1_400_000_000_000_000_000n } }),
      63_727.93,
    );
    expect(snapshot.kind).toBe("ok");
    if (snapshot.kind === "ok") {
      expect(snapshot.tcrPct).toBeCloseTo(140, 8);
      expect(snapshot.recoveryMode).toBe(true);
      expect(snapshot.redemptionsOpen).toBe(true);
    }
  });
});

describe("protocol helpers", () => {
  it("scales 1e18 rates into percent", () => {
    expect(rateWeiToPct(1_100_000_000_000_000_000n)).toBeCloseTo(110, 8);
    expect(rateWeiToPct(0n)).toBe(0);
    expect(rateWeiToPct(-1n)).toBeNull();
  });

  it("encodes a human price into an 18-decimal argument", () => {
    expect(priceUsdToWei18(63_727.93)).toBe(63_727_930_000_000_000_000_000n);
    expect(priceUsdToWei18(0)).toBeNull();
    expect(priceUsdToWei18(Number.NaN)).toBeNull();
  });

  it("keeps Recovery Mode and redemption gates at their documented lines", () => {
    expect(isRecoveryMode(149.99)).toBe(true);
    expect(isRecoveryMode(150)).toBe(false);
    expect(areRedemptionsOpen(110, 110)).toBe(true);
    expect(areRedemptionsOpen(109.9, 110)).toBe(false);
    expect(areRedemptionsOpen(Number.NaN, 110)).toBe(false);
  });
});
