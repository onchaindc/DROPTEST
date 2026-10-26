/**
 * Verified Mezo protocol facts.
 *
 * Every parameter below is taken from official Mezo documentation.
 * Anything the docs do NOT state is exposed as a user-configurable
 * assumption elsewhere in the app — never hardcoded as protocol fact.
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
 * borrower penalty.surf We surface this explicitly in the assumptions
 * panel instead of inventing a number.
 */
export const NO_DOCUMENTED_LIQUIDATION_PENALTY = true;

/**
 * Mezo testnet — the only network we do read-only calls against.
 * Values from official docs:
 * - https://mezo.org/docs/developers/getting-started/ (chain id, RPC, explorer)
 * - https://mezo.org/docs/developers/architecture/oracles/ (oracle addresses)
 * - https://mezo.org/docs/developers/getting-started/musd-payments-x402/x402-quickstart/ (MUSD testnet address)
 */
export const MEZO_TESTNET = {
  chainId: 31611,
  rpc: "https://rpc.test.mezo.org",
  explorer: "https://explorer.test.mezo.org",
  /** MUSD token on Mezo Testnet (18 decimals, per x402 quickstart). */
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as `0x${string}`,
  /**
   * Mezo BTC/USD Chainlink-compatible aggregator — Skip oracle address
   * officially published for both Mezo Mainnet and Testnet. Read-only.
   */
  btcUsdAggregator: "0x7b7c000000000000000000000000000000000015" as `0x${string}`,
  pythProxy: "0x2880aB155794e7179c9eE2e38200202908C17B43" as `0x${string}`,
} as const;

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
