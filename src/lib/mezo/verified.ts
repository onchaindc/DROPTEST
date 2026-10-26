/**
 * Verified Mezo protocol facts.
 *
 * Every parameter below is taken from official Mezo documentation.
 * Anything the docs do NOT state is exposed as a user-configurable
 * assumption elsewhere in the app — never hardcoded as protocol fact.
 *
 * Contract addresses come from the official mUSD redemptions guide,
 * which publishes the MUSD protocol addresses (all proxy contracts) for
 * both networks. They were additionally confirmed live with read-only
 * `eth_call`s before being used here; see POSITION_READ_METHODS in
 * `live-position.ts` for the exact methods DROPTEST calls.
 */

export interface VerifiedFact {
  /** Exact or near-exact wording from the cited source. */
  quote: string;
  source: string;
}

/**
 * Individual trove minimum collateralization ratio measured against
 * each position (not the system TCR). Docs quote: "all loan positions
 * must maintain a collateral ratio above 110%."
 */
export const INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT = 110;

/**
 * System-wide total collateral ratio (TCR) trigger for Recovery Mode.
 * Docs quote: "Recovery Mode: Activated if TCR falls below 150%,
 * enforcing stricter borrowing rules." This is a system threshold —
 * not a per-position liquidation trigger.
 */
export const SYSTEM_RECOVERY_MODE_TCR_PCT = 150;

/**
 * The docs do not state a separate, named borrower-facing liquidation
 * penalty; the 0.5% figure below is a liquidator reward, not a
 * borrower penalty. We surface this explicitly in the assumptions
 * panel instead of inventing a number.
 */
export const NO_DOCUMENTED_LIQUIDATION_PENALTY = true;

/** Source for the deployed MUSD protocol contract addresses. */
export const MEZO_ADDRESS_SOURCE =
  "https://mezo.org/docs/developers/musd/musd-redemptions/";

/** Source for the network endpoints (chain ids, RPCs, explorers). */
export const MEZO_NETWORK_SOURCE =
  "https://mezo.org/docs/users/getting-started/connect/";

/** Source for the oracle addresses. */
export const MEZO_ORACLE_SOURCE =
  "https://mezo.org/docs/developers/architecture/oracles/";

/**
 * MUSD protocol contracts DROPTEST reads (read-only `eth_call`s).
 * All are proxy contracts; reads go through the proxy, which is what
 * the official guide tells integrators to do.
 */
export interface MezoContractAddresses {
  /** Holds troves, the MCR, and interest/pending-reward composition. */
  troveManager: `0x${string}`;
  /** Borrowing entry point; not called by DROPTEST (no transactions). */
  borrowerOperations: `0x${string}`;
  /** MUSD token. */
  musd: `0x${string}`;
  /** Protocol price feed; `fetchPrice()` is the price the protocol uses. */
  priceFeed: `0x${string}`;
  /**
   * Skip BTC/USD aggregator. Verified live as the `oracle()` of the
   * protocol PriceFeed on both networks. Read for the oracle's own
   * `updatedAt` freshness stamp, with `decimals()` read from the chain
   * (the deployed feed uses 18 decimals, not Chainlink's usual 8).
   */
  btcUsdAggregator: `0x${string}`;
}

export interface MezoNetwork {
  id: "testnet" | "mainnet";
  /** Storage/UI key. Always shown wherever the network can be picked. */
  label: string;
  /** True for the network DROPTEST defaults to in production. */
  production: boolean;
  chainId: number;
  rpc: string;
  explorer: string;
  contracts: MezoContractAddresses;
  /** Documentation page the addresses were taken from. */
  addressSource: string;
}

/**
 * Mezo Testnet (chain id 31611) — NOT the production network for
 * DROPTEST reads. It stays only so an explicitly selected testnet
 * address is never read against mainnet state (which could mislead).
 * Every caller must show this label where the network can be picked.
 * Values from official docs:
 * - https://mezo.org/docs/users/getting-started/connect/ (chain id, RPC, explorer)
 * - https://mezo.org/docs/developers/musd/musd-redemptions/ (protocol contracts)
 * - https://mezo.org/docs/developers/architecture/oracles/ (oracle addresses)
 */
export const MEZO_TESTNET: MezoNetwork = {
  id: "testnet",
  label: "Mezo Testnet (experimental — not production data)",
  production: false,
  chainId: 31611,
  rpc: "https://rpc.test.mezo.org",
  explorer: "https://explorer.test.mezo.org",
  addressSource: MEZO_ADDRESS_SOURCE,
  contracts: {
    troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
    borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
    musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
    btcUsdAggregator: "0x7b7c000000000000000000000000000000000015",
  },
};

/**
 * Mezo Mainnet — the production network DROPTEST reads by default:
 * live MUSD borrowing, the documented Skip BTC/USD oracle, and real
 * troves. Defaults were verified from official docs AND confirmed with
 * live read-only calls before being shipped:
 * - eth_chainId === 31612
 * - PriceFeed `oracle()` resolves to the documented Skip aggregator
 * - PriceFeed `fetchPrice()` agrees with the `latestRoundData()` answer
 * - TroveManager `MCR()` returns 1.1e18 (the documented 110% MCR)
 * - `getEntireDebtAndColl(address)` on a real active trove decodes with
 *   the document mUSD TroveManager struct semantics
 */
export const MEZO_MAINNET: MezoNetwork = {
  id: "mainnet",
  label: "Mezo Mainnet (production)",
  production: true,
  chainId: 31612,
  rpc: "https://mezo-mainnet.boar.network",
  explorer: "https://explorer.mezo.org",
  addressSource: MEZO_ADDRESS_SOURCE,
  contracts: {
    troveManager: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
    borrowerOperations: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
    musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
    priceFeed: "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88",
    btcUsdAggregator: "0x7b7c000000000000000000000000000000000015",
  },
};

export const MEZO_NETWORKS: readonly MezoNetwork[] = [MEZO_MAINNET, MEZO_TESTNET];

/** The network every default read uses: mainnet, explicitly. */
export const DEFAULT_MEZO_NETWORK: MezoNetwork = MEZO_MAINNET;

/** Resolve a stored / query-string network id; null when unknown. */
export function resolveMezoNetwork(id: string | null | undefined): MezoNetwork | null {
  if (id === null || id === undefined) return null;
  return MEZO_NETWORKS.find((n) => n.id === id) ?? null;
}

/**
 * Chain-mismatch guard: resolves the network a `eth_chainId` response
 * belongs to, or null when the connected RPC answers with an unknown
 * chain. Every network-aware reader must check this before decoding.
 */
export function mezoNetworkByChainId(chainId: number): MezoNetwork | null {
  return MEZO_NETWORKS.find((n) => n.chainId === chainId) ?? null;
}

/** Blockscout address page for a wallet on the given network. */
export function explorerAddressUrl(network: MezoNetwork, address: string): string {
  return `${network.explorer}/address/${address}`;
}

/** Blockscout token page (MUSD) for the given network. */
export function explorerTokenUrl(network: MezoNetwork, address: string): string {
  return `${network.explorer}/token/${address}`;
}

/**
 * Documentation conflicts to disclose (never resolve silently).
 * An older Mezo matsnet-Alpha blog states "Loans under 150% collateral
 * risk liquidation", which conflicts with the developer guide's single
 * 110% liquidation process. We model 110% as the per-position threshold
 * (current developer guide) and mention the discrepancy.
 */
export const DOC_CONFLICT_NOTE: VerifiedFact = {
  source: "https://mezo.org/blog/borrow-against-your-bitcoin-with-musd/",
  quote:
    "Recovery Mode: Triggers when system collateral drops below 150% …… Loans under 150% collateral risk liquidation",
};
