import { describe, expect, it } from "vitest";

import { MEZO_MAINNET, MEZO_TESTNET } from "./verified";
import {
  ORACLE_STALE_MS,
  answerToPriceUsd,
  fetchBtcUsdPrice,
  isOracleStale,
  oracleInvalidReason,
  type MezoReadClient,
} from "./oracle";

/**
 * Minimal fake of the viem PublicClient surface that the readers touch,
 * cast to MezoReadClient because the app-side type is structurally
 * richer than a fixture needs to be.
 */
interface FakeOptions {
  chainId?: number;
  throwOnRead?: string;
  throwOnChainId?: boolean;
  decimals?: number;
  round?: [bigint, bigint, bigint, bigint, bigint];
  blockNumber?: bigint;
}

const DEFAULT_ROUND: [bigint, bigint, bigint, bigint, bigint] = [
  9988n,
  79572705800000000000000n,
  1n,
  1_793_000_000n, // updatedAt in unix seconds (matches the fixture clock)
  9988n,
];

function makeClient(options: FakeOptions = {}): MezoReadClient {
  return {
    getChainId: async () => {
      if (options.throwOnChainId) throw new Error("connection refused");
      return options.chainId ?? MEZO_MAINNET.chainId;
    },
    getBlockNumber: async () => options.blockNumber ?? 12780259n,
    readContract: async (args: { functionName: string }) => {
      if (options.throwOnRead && options.throwOnRead === args.functionName) {
        throw new Error("oracle call reverted");
      }
      if (args.functionName === "decimals") {
        // Real chain value observed on mainnet: 18, not Chainlink's 8.
        return options.decimals ?? 18;
      }
      if (args.functionName === "latestRoundData") {
        return options.round ?? DEFAULT_ROUND;
      }
      throw new Error(`unexpected call ${String(args.functionName)}`);
    },
  } as unknown as MezoReadClient;
}

describe("unit conversions", () => {
  it("scales an 18-decimal aggregator answer into a real BTC/USD price", () => {
    // Observed live on Mezo mainnet: answer 79572705800000000000000 → $79,572.7058
    expect(answerToPriceUsd(79572705800000000000000n, 18)).toBeCloseTo(
      79572.7058,
      4,
    );
  });

  it("still works if the deployment switches to 8 decimals (read, not assumed)", () => {
    expect(answerToPriceUsd(6500000000000n, 8)).toBeCloseTo(65000, 3);
  });

  it("rejects unusable decimal counts and non-finite results", () => {
    expect(answerToPriceUsd(1n, 37)).toBeNull();
    expect(answerToPriceUsd(1n, -1)).toBeNull();
    expect(answerToPriceUsd(0n, 18)).toBeNull();
  });
});

describe("oracle validation", () => {
  it("accepts a structurally valid 18-decimal reading", () => {
    expect(
      oracleInvalidReason(79572705800000000000000n, 18, 1_793_023_622n),
    ).toBeNull();
  });

  it("rejects non-positive answers, unreported update times and bad decimals", () => {
    expect(oracleInvalidReason(0n, 18, 1_793_023_622n)).toMatch(
      /non-positive answer/,
    );
    expect(oracleInvalidReason(-5n, 18, 1_793_023_622n)).toMatch(
      /non-positive answer/,
    );
    expect(oracleInvalidReason(5n, 18, 0n)).toMatch(/update time/);
    expect(oracleInvalidReason(5n, 300, 1_793_023_622n)).toMatch(/decimals/);
    expect(oracleInvalidReason(5n, 8, 1_793_023_622n)).toBeNull();
  });
});

describe("oracle freshness", () => {
  const now = 1_000_000_000_000;

  it("flags readings newer than the staleness window as fresh", () => {
    expect(isOracleStale(now - 60_000, now)).toBe(false);
  });

  it("flags readings older than the window as stale", () => {
    expect(isOracleStale(now - ORACLE_STALE_MS - 1, now)).toBe(true);
  });

  it("treats a missing or nonsensical update time as stale, not fresh", () => {
    expect(isOracleStale(0, now)).toBe(true);
    expect(isOracleStale(Number.NaN, now)).toBe(true);
  });

  it("keeps the documented 'updates every block' bias: 10 minutes is generous", () => {
    expect(ORACLE_STALE_MS).toBe(10 * 60 * 1000);
  });
});

describe("fetchBtcUsdPrice", () => {
  it("returns the real price, decimals, round and block when the chain agrees", async () => {
    const nowMs = 1_793_000_000_000 + 30_000; // 30s after the round's updatedAt
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient(),
      nowMs,
    );
    expect(reading.kind).toBe("ok");
    if (reading.kind !== "ok") return;
    expect(reading.priceUsd).toBeCloseTo(79572.7058, 4);
    expect(reading.decimals).toBe(18);
    expect(reading.roundId).toBe(9988n);
    expect(reading.blockNumber).toBe(12780259);
    expect(reading.chainId).toBe(31612);
    expect(reading.updatedAtMs).toBe(1_793_000_000_000);
    // The fixture's nowMs is 30s after the round's updatedAt → fresh.
    expect(reading.stale).toBe(false);
  });

  it("flags a materially old reading as stale", async () => {
    const nowMs = 1_793_000_000_000 + 700_000; // ~11.7 min after update
    const round: [bigint, bigint, bigint, bigint, bigint] = [
      9988n,
      65000000000000000000000n,
      0n,
      1_793_000_000n,
      9988n,
    ];
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ round }),
      nowMs,
    );
    expect(reading.kind).toBe("ok");
    if (reading.kind === "ok") expect(reading.stale).toBe(true);
  });

  it("marks a just-updated reading as not stale", async () => {
    const nowMs = 1_793_000_000_000 + 30_000;
    const round: [bigint, bigint, bigint, bigint, bigint] = [
      9988n,
      65000000000000000000000n,
      0n,
      BigInt(Math.floor((nowMs - 2000) / 1000)),
      9988n,
    ];
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ round }),
      nowMs,
    );
    expect(reading.kind).toBe("ok");
    if (reading.kind === "ok") expect(reading.stale).toBe(false);
  });

  it("errors with a chain-mismatch stage when the RPC answers another chain", async () => {
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ chainId: MEZO_TESTNET.chainId }),
    );
    expect(reading).toEqual({
      kind: "error",
      stage: "chain-mismatch",
      message: expect.stringContaining("31611"),
    });
  });

  it("errors with an invalid-price stage for non-positive answers", async () => {
    const round: [bigint, bigint, bigint, bigint, bigint] = [
      9988n,
      -1n,
      0n,
      1_793_023_622n,
      9988n,
    ];
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ round }),
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") {
      expect(reading.stage).toBe("invalid-price");
      expect(reading.message).toMatch(/non-positive/);
    }
  });

  it("errors with an invalid-price stage when decimals are unusable", async () => {
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ decimals: 300 }),
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") expect(reading.stage).toBe("invalid-price");
  });

  it("errors with an rpc stage when the chain id call itself fails", async () => {
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ throwOnChainId: true }),
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") {
      expect(reading.stage).toBe("rpc");
      expect(reading.message).toMatch(/connection refused/);
    }
  });

  it("errors with an rpc stage when the aggregator call reverts", async () => {
    const reading = await fetchBtcUsdPrice(
      MEZO_MAINNET,
      makeClient({ throwOnRead: "latestRoundData" }),
    );
    expect(reading.kind).toBe("error");
    if (reading.kind === "error") {
      expect(reading.stage).toBe("rpc");
      expect(reading.message).toMatch(/reverted/);
    }
  });
});
