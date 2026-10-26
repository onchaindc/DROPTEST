# DROPTEST

**Know where your position breaks.**

DROPTEST is a Bitcoin collateral risk research tool for the [Mezo](https://mezo.org) ecosystem. It shows how a fall in BTC's price affects a hypothetical BTC-backed MUSD borrowing position: crash scenarios, the exact liquidation price, remaining headroom, and side-by-side path comparisons.

## Highlights

- **Tested pure risk engine** (`src/lib/engine/risk.ts`): collateral ratio, LTV, liquidation price, drop to liquidation, preset shocks, compounded crash timelines, and reverse stress testing (pick a ratio target, solve for the price). 36 unit tests in `src/lib/engine/` cover the math and its boundaries, including the exact "falls below 110%" threshold wording.
- **Scenario Studio** (`/studio`): compare up to three named hypothetical price paths with gradual decline, sudden crash, and prolonged bear market presets. Saved in local storage with reset and delete controls.
- **Reverse stress testing**: enter any collateral ratio target and read the BTC price that reaches it, clearly labelled as a user what-if distinct from Mezo's documented 110% threshold.
- **Printable reports** (`/report`): a clean print-ready report with position inputs, assumptions, results, charts, sources, and generation time. No private data is included; save to PDF via the browser print dialog.
- **Read-only Mezo testnet oracle**: one live call, `latestRoundData()` on the Skip BTC/USD aggregator via viem. No wallet, no keys, no signing. The reading shows its update time and a stale flag; failures surface honestly and nothing is fabricated.
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
npm test        # vitest, 47 unit tests (engine, price paths, report snapshot)
npx tsc --noEmit
```

## Sections

- `/` Overview: what the tool does, verified parameters, the oracle integration.
- `/lab` Stress Lab: position inputs, threshold assumption, ratio curve, crash timeline, preset and custom shocks, reverse stress test, oracle sync, printable report.
- `/studio` Scenario Studio: up to three named price paths compared on one chart, with per-path lowest ratio, first threshold breach, and ending collateral value.
- `/method` Research & Methodology: formulas, recovered documented wording, Recovery Mode distinction, liquidation mechanics, interest limitations, oracle source, and full citation list.
- `/report` Printable report generated from the lab or studio.

## Not financial advice

DROPTEST simulates hypothetical positions only. It does not connect to personal wallets or live positions, and it is not financial advice.
