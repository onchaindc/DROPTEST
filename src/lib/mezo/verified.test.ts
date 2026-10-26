import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEZO_NETWORK,
  MEZO_MAINNET,
  MEZO_NETWORKS,
  MEZO_TESTNET,
  mezoNetworkByChainId,
  resolveMezoNetwork,
} from "./verified";

describe("network configuration", () => {
  it("defaults every read to Mezo mainnet", () => {
    expect(DEFAULT_MEZO_NETWORK.id).toBe("mainnet");
    expect(DEFAULT_MEZO_NETWORK.chainId).toBe(31612);
    expect(DEFAULT_MEZO_NETWORK.production).toBe(true);
    expect(DEFAULT_MEZO_NETWORK.rpc).toBe("https://mezo-mainnet.boar.network");
    expect(DEFAULT_MEZO_NETWORK.explorer).toBe("https://explorer.mezo.org");
  });

  it("labels testnet as non-production and keeps its mainnet values distinct", () => {
    expect(MEZO_TESTNET.production).toBe(false);
    expect(MEZO_TESTNET.id).toBe("testnet");
    expect(MEZO_TESTNET.label).toContain("Testnet");
    expect(MEZO_TESTNET.chainId).toBe(31611);
    // An accidental mix would show up here: the two networks share no ids.
    expect(MEZO_TESTNET.chainId).not.toBe(MEZO_MAINNET.chainId);
    expect(MEZO_TESTNET.contracts.troveManager).not.toBe(
      MEZO_MAINNET.contracts.troveManager,
    );
    expect(MEZO_TESTNET.rpc).not.toBe(MEZO_MAINNET.rpc);
  });

  it("carries the documented mainnet contract set together with chain id and RPC", () => {
    const c = MEZO_MAINNET.contracts;
    expect(c.troveManager.toLowerCase()).toBe(
      "0x94afb503dbca74ac3e4929baceedfce19b93c193",
    );
    expect(c.priceFeed.toLowerCase()).toBe(
      "0xc5ac5a8892230e0a3e1c473881a2de7353ffca88",
    );
    expect(c.musd.toLowerCase()).toBe("0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186");
    expect(c.btcUsdAggregator.toLowerCase()).toBe(
      "0x7b7c000000000000000000000000000000000015",
    );
  });

  it("exposes every network with all five contract addresses defined", () => {
    for (const network of MEZO_NETWORKS) {
      expect(
        Object.values(network.contracts).every(
          (v) => typeof v === "string" && v.startsWith("0x") && v.length === 42,
        ),
      ).toBe(true);
    }
  });

  it("mainnet aggregates the Skip feed; only the explicit testnet entry carries testnet contracts", () => {
    // Both documented deployments use Skip's deterministic feed address,
    // but each entry must still carry its own copy (never a foreign one).
    expect(MEZO_MAINNET.contracts.btcUsdAggregator).toBe(
      MEZO_TESTNET.contracts.btcUsdAggregator,
    );
    expect(MEZO_MAINNET.contracts.priceFeed).not.toBe(
      MEZO_TESTNET.contracts.priceFeed,
    );
  });
});

describe("network selection helpers", () => {
  it("resolves mainnet and testnet by id and rejects unknown ids", () => {
    expect(resolveMezoNetwork("mainnet")?.id).toBe("mainnet");
    expect(resolveMezoNetwork("testnet")?.id).toBe("testnet");
    expect(resolveMezoNetwork("localhost")).toBeNull();
    expect(resolveMezoNetwork("")).toBeNull();
    expect(resolveMezoNetwork(null)).toBeNull();
    expect(resolveMezoNetwork(undefined)).toBeNull();
  });

  it("resolves a connected chain id to its network for the mismatch guard", () => {
    expect(mezoNetworkByChainId(31612)?.id).toBe("mainnet");
    expect(mezoNetworkByChainId(31611)?.id).toBe("testnet");
    // Any other chain has no Mezo config at all: reads must abort.
    expect(mezoNetworkByChainId(1)).toBeNull();
  });
});
