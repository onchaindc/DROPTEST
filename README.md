# DROPTEST

**Know where your position breaks.**

DROPTEST is a Bitcoin collateral risk research tool for the [Mezo](https://mezo.org) ecosystem. It shows how a fall in BTC's price affects a hypothetical BTC-backed MUSD borrowing position: crash scenarios, the exact liquidation price, remaining headroom, and side-by-side path comparisons.

**Live demo:** https://droptest-mezo.vercel.app

Built for the Mezo buildathon. Strictly read-only. No wallets, no keys, no signing, no invented numbers.

## For judges / demo path

1. Open the [Stress Lab](https://droptest-mezo.vercel.app/lab) with the sample position (0.25 BTC, ~11,165 MUSD, $67k spot → 150% ratio).
2. Watch the headline metrics and the liquidation price at the documented 110% threshold.
3. Switch to **Shocks & reverse** — try the severity ladder and reverse stress (pick any ratio target).
4. Open **Live reads** — sync the mainnet Skip BTC/USD oracle or look up any public address's open trove. Copy it into the hypothetical inputs (clearly labeled on-chain vs calculated).
5. Visit [Scenario Studio](https://droptest-mezo.vercel.app/studio) to compare gradual / sudden / prolonged paths.
6. Read [Research & Methodology](https://droptest-mezo.vercel.app/method) for the formulas, the 110% vs 150% Recovery Mode distinction, and every source.
7. Generate a printable report from either tool.

## Highlights

- **Tested pure risk engine** (`src/lib/engine/risk.ts`): collateral ratio, LTV, liquidation price, drop to liquidation, preset shocks, compounded crash timelines, and reverse stress testing (pick a ratio target, solve for the price). 63 unit tests in `src/lib/engine/` cover the math and its boundaries, including the exact "falls below 110%" threshold wording, plus the fee, interest, rescue, liquidation and historical-replay modules.
- **Tested mainnet integration** (`src/lib/mezo/`): 56 unit tests cover network selection and chain-mismatch guarding, oracle price/decimal/update-time validation and freshness/staleness, live protocol reads (`MCR`, `getTCR`, `borrowingRate`, `redemptionRate`), trove decoding (`getEntireDebtAndColl` + `Troves` struct), unit conversions, pending-reward semantics, empty positions, and RPC failures; a further 13 tests span the engine's scenario paths and 13 cover share links, CSV export and report snapshots. Explicit live checks against real mainnet data live in `npx vitest run src/lib/mezo/live.e2e.check.ts` and `node scripts/mezo-live-check.mjs` (network-gated, never run by `npm test`).
- **Scenario Studio** (`/studio`): compare up to three named hypothetical price paths with gradual decline, sudden crash, and prolonged bear market presets. Saved in local storage with reset and delete controls.
- **Live Position Watch** (`/lab`): enter any public EVM address and read its real open trove from the Mezo mainnet TroveManager proxy — collateral, principal, accrued interest (incl. accrued-to-current-block), pending redistributed rewards, and the per-trove fixed interest rate via `getEntireDebtAndColl(address)`, `getTroveStatus(address)` and `Troves(address)`. Strictly read-only; an empty address is reported as "no position", and RPC/decode errors are never shown as positions. A fully loaded position can be copied into the hypothetical inputs with on-chain/calculated labels.
- **Reverse stress testing**: enter any collateral ratio target and read the BTC price that reaches it, clearly labelled as a user what-if distinct from Mezo's documented 110% threshold.
- **Historical context** (`src/lib/engine/historical.ts`): reference peak-to-trough drops (COVID 2020, 2021, 2022 bear) so users can ask "how would this have looked during X?" without treating history as a forecast.
- **Interest sensitivity** (assumption only): simple fixed-rate projection over 30/90/180 days. Mezo documents a 1–5% range but does not publish a live rate, so this is never presented as protocol fact.
- **Printable reports** (`/report`): a clean print-ready report with position inputs, assumptions, results, charts, sources, and generation time. No private data is included; save to PDF via the browser print dialog.
- **Read-only Mezo mainnet oracle**: the documented Skip BTC/USD aggregator via viem (`latestRoundData()` + `decimals()` read from the chain — the deployed feed uses 18 decimals, not Chainlink-typical 8), after verifying the connected chain id (31612). No wallet, no keys, no signing. The reading shows its update time and a stale flag (the feed updates every block per the docs; >10 min is flagged); failures surface honestly and nothing is fabricated.
- **Live reads surfaced on the overview**: the landing page carries the oracle badge and the Live Position Watch (mainnet by default) so the read-only flows are visible without opening the lab; the full experience with network selection sits in `/lab`.
- **Mainnet is the default network** (`src/lib/mezo/verified.ts`): Mezo mainnet — chain id 31612, RPC `https://mezo-mainnet.boar.network`, explorer `explorer.mezo.org`, Skip aggregator `0x7b7c00…0015`, TroveManager proxy `0x94AfB503…93c193`, PriceFeed `0xc5aC5A88…fFcA88`, MUSD `0xdD468A1D…F186`. Testnet (31611) remains available only through an explicitly labelled network selector, so testnet data can never be mixed into a mainnet read. Every address and ABI was verified against the live chain before shipping (`node scripts/mezo-live-check.mjs`); the live check found a real active trove and confirmed `MCR()` = 1.1e18, i.e. the documented 110% per-trove threshold (with the 150% system Recovery Mode TCR kept separate).
- **Documented protocol assumptions**: parameters pinned to official Mezo docs with inline citations; anything the docs do not state is a labelled, user-tunable assumption.

## Capabilities

- **Live system health** (`src/lib/mezo/protocol.ts`): reads `MCR()` and `getTCR(price)` from the TroveManager proxy and `borrowingRate()` / `redemptionRate()` from BorrowerOperations, then derives the Recovery Mode flag (documented 150% TCR trigger) and the redemption gate (TCR ≥ MCR). Selectors verified against `TroveManager.sol` and live mainnet (`MCR()` returned 1.1e18, rates 0.001e18 / 0.0075e18). Every failure is typed, the chain id is checked first, and the panel never shows a fabricated system ratio.
- **Borrow cost model** (`src/lib/engine/fees.ts`): documented 0.1% issuance fee, 200 MUSD gas deposit returned on close, 0.75% redemption fee, refinance-fee conflict disclosed, and both readings of "fee paid in MUSD" (paid from proceeds vs capitalised into debt) shown side by side.
- **Interest drag** (`src/lib/engine/interest.ts`): 30 / 90 / 180 / 365-day debt projection showing the ratio drift and the *liquidation price* drift at a chosen fixed rate — or at the loaded trove's own on-chain rate — plus the interest-only runway to the liquidation line.
- **Rescue planner and breakpoints** (`src/lib/engine/rescue.ts`): size the BTC top-up or MUSD repayment needed to hold a chosen ratio through a chosen crash, and read the price at which the ratio reaches 110 / 125 / 150 / 200 / 300%.
- **Liquidation structure** (`src/lib/engine/liquidation.ts`): splits seized collateral into the documented 0.5% liquidator reward, 200 MUSD gas compensation and the Stability Pool remainder, and derives the price where bad debt begins.
- **Redemption what-if** (`redemptionImpact` in `fees.ts`): a redemption against this trove burns debt and removes BTC at par; above 100% collateral that *raises* the ratio, which the UI explains instead of hiding.
- **Historical replay** (`replayHistoricalCrashes`): the reference drawdowns applied once to the current position, with survival verdicts. Context, never a forecast.
- **Shareable scenario links** (`src/lib/share.ts`): the position and custom shock encoded into the URL and strictly re-validated on open; a broken link falls back to the sample position.
- **CSV risk pack** (`src/lib/export.ts`): RFC 4180-quoted export of the position, shocks, timeline, breakpoints and historical replays.
- **Report v2** (`/report`): carries the fee schedule, interest drag, rescue plan, breakpoint ladder, liquidation split and historical replay, each recomputed from the sanitised snapshot.
- **Lab workspace**: *Position*, *Stress tests*, *Costs & interest*, *Rescue & history*, *Live data* and *Method* sections, plus a persistent position-health strip, one-click "borrow to a ratio" presets, shareable links and CSV export.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Recharts · viem · Vitest.

## Develop

```bash
npm install
npm run dev   # binds 0.0.0.0:${PORT:-3000}
```

## Test / verify

```bash
npm test        # vitest, 151 unit tests (engine, fees, interest, rescue, liquidation, paths, report, share links, CSV, network, oracle, protocol, troves)
npx tsc --noEmit
```

## Sections

- `/` Overview: what the tool does, verified parameters, the oracle integration, and the live read tools (oracle badge + trove lookup, read-only).
- `/lab` Stress Lab: a tabbed workspace — **Position** (inputs, threshold assumption, headline metrics), **Charts** (ratio curve, crash timeline), **Shocks & reverse** (custom shock, preset ladder, reverse stress test), **Live reads** (oracle sync, live trove lookup by public address, network selector), and **Assumptions** (documented parameters and sources) — printable report from the header.
- `/studio` Scenario Studio: up to three named price paths compared on one chart, with per-path lowest ratio, first threshold breach, and ending collateral value.
- `/method` Research & Methodology: formulas, recovered documented wording, Recovery Mode distinction, liquidation mechanics, interest limitations, oracle source, and full citation list.
- `/report` Printable report generated from the lab or studio, now including costs, interest drag, rescue sizing, breakpoints, liquidation structure and historical replay.

## Not financial advice

DROPTEST simulates hypothetical positions only. It does not connect to personal wallets or live positions, and it is not financial advice.
