# DROPTEST

**Know where your position breaks.**

DROPTEST is a Bitcoin collateral risk research tool for the [Mezo](https://mezo.org) ecosystem. It shows how a fall in BTC's price affects a hypothetical BTC-backed MUSD borrowing position: crash scenarios, the exact liquidation price, remaining headroom, and side-by-side path comparisons.

## Highlights

- **Tested pure risk engine** (`src/lib/engine/risk.ts`): collateral ratio, LTV, liquidation price, drop to liquidation, preset shocks, compounded crash timelines, and reverse stress testing (pick a ratio target, solve for the price). 36 unit tests in `src/lib/engine/` cover the math and its boundaries, including the exact "falls below 110%" threshold wording.
- **Tested mainnet integration** (`src/lib/mezo/`): 47 unit tests cover network selection and chain-mismatch guarding, oracle price/decimal/update-time validation and freshness/staleness, trove decoding (`getEntireDebtAndColl` + `Troves` struct), unit conversions, pending-reward semantics, empty positions, and RPC failures; a further 11 tests span the risk engine's scenario paths. Explicit live checks against real mainnet data live in `npx vitest run src/lib/mezo/live.e2e.check.ts` and `node scripts/mezo-live-check.mjs` (network-gated, never run by `npm test`).
- **Scenario Studio** (`/studio`): compare up to three named hypothetical price paths with gradual decline, sudden crash, and prolonged bear market presets. Saved in local storage with reset and delete controls.
- **Live Position Watch** (`/lab`): enter any public EVM address and read its real open trove from the Mezo mainnet TroveManager proxy — collateral, principal, accrued interest (incl. accrued-to-current-block), pending redistributed rewards, and the per-trove fixed interest rate via `getEntireDebtAndColl(address)`, `getTroveStatus(address)` and `Troves(address)`. Strictly read-only; an empty address is reported as "no position", and RPC/decode errors are never shown as positions. A fully loaded position can be copied into the hypothetical inputs with on-chain/calculated labels.
- **Reverse stress testing**: enter any collateral ratio target and read the BTC price that reaches it, clearly labelled as a user what-if distinct from Mezo's documented 110% threshold.
- **Printable reports** (`/report`): a clean print-ready report with position inputs, assumptions, results, charts, sources, and generation time. No private data is included; save to PDF via the browser print dialog.
- **Read-only Mezo mainnet oracle**: the documented Skip BTC/USD aggregator via viem (`latestRoundData()` + `decimals()` read from the chain — the deployed feed uses 18 decimals, not Chainlink-typical 8), after verifying the connected chain id (31612). No wallet, no keys, no signing. The reading shows its update time and a stale flag (the feed updates every block per the docs; >10 min is flagged); failures surface honestly and nothing is fabricated.
- **Live reads surfaced on the overview**: the landing page carries the oracle badge and the Live Position Watch (mainnet by default) so the read-only flows are visible without opening the lab; the full experience with network selection sits in `/lab`.
- **Mainnet is the default network** (`src/lib/mezo/verified.ts`): Mezo mainnet — chain id 31612, RPC `https://mezo-mainnet.boar.network`, explorer `explorer.mezo.org`, Skip aggregator `0x7b7c00…0015`, TroveManager proxy `0x94AfB503…93c193`, PriceFeed `0xc5aC5A88…fFcA88`, MUSD `0xdD468A1D…F186`. Testnet (31611) remains available only through an explicitly labelled network selector, so testnet data can never be mixed into a mainnet read. Every address and ABI was verified against the live chain before shipping (`node scripts/mezo-live-check.mjs`); the live check found a real active trove and confirmed `MCR()` = 1.1e18, i.e. the documented 110% per-trove threshold (with the 150% system Recovery Mode TCR kept separate).
- **Documented protocol assumptions**: parameters pinned to official Mezo docs with inline citations; anything the docs do not state is a labelled, user-tunable assumption.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Recharts · viem · Vitest.

## Develop

```bash
npm install
npm run dev   # binds 0.0.0.0:${PORT:-3000}
```

## Test / verify

```bash
npm test        # vitest, 94 unit tests (engine, paths, report, network, oracle, trove decoding)
npx tsc --noEmit
```

## Sections

- `/` Overview: what the tool does, verified parameters, the oracle integration, and the live read tools (oracle badge + trove lookup, read-only).
- `/lab` Stress Lab: a tabbed workspace — **Position** (inputs, threshold assumption, headline metrics), **Charts** (ratio curve, crash timeline), **Shocks & reverse** (custom shock, preset ladder, reverse stress test), **Live reads** (oracle sync, live trove lookup by public address, network selector), and **Assumptions** (documented parameters and sources) — printable report from the header.
- `/studio` Scenario Studio: up to three named price paths compared on one chart, with per-path lowest ratio, first threshold breach, and ending collateral value.
- `/method` Research & Methodology: formulas, recovered documented wording, Recovery Mode distinction, liquidation mechanics, interest limitations, oracle source, and full citation list.
- `/report` Printable report generated from the lab or studio.

## Not financial advice

DROPTEST simulates hypothetical positions only. It does not connect to personal wallets or live positions, and it is not financial advice.
