/**
 * Read-only viem client factory for a Mezo network.
 *
 * One client per network definition (`MezoNetwork`), so a call can never
 * mix a mainnet RPC with testnet contract addresses: both sides always
 * come from the same `MezoNetwork` object.
 */
import { createPublicClient, defineChain, http, type PublicClient } from "viem";

import type { MezoNetwork } from "@/lib/mezo/verified";

/** Public client shape used by every Mezo reader in `@/lib/mezo`. */
export type MezoClient = PublicClient;

/** Build a read-only client pinned to the given Mezo network. */
export function createMezoClient(network: MezoNetwork): MezoClient {
  const chain = defineChain({
    id: network.chainId,
    name: network.label,
    nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
    rpcUrls: { default: { http: [network.rpc] } },
    blockExplorers: {
      default: { name: "Mezo Explorer", url: network.explorer },
    },
  });
  return createPublicClient({ chain, transport: http(network.rpc, { timeout: 30_000 }) });
}
