# DROPTEST

**Stress-test your Bitcoin collateral before the market does.**

DROPTEST is an interactive risk simulation lab for the [Mezo](https://mezo.org) ecosystem. It models how BTC price shocks affect hypothetical BTC-backed MUSD borrowing positions, visualizes collateral health, and identifies dangerous scenarios before real capital is at risk.

## Highlights

- **Tested risk engine** (`src/lib/engine/risk.ts`) — pure functions for collateral ratio, LTV, liquidation price, drop-to-liquidation, scenario shocks, and compounded crash timelines. 23 unit tests in `src/lib/engine/risk.test.ts` cover the math and its boundary conditions (the exact "falls below 110%" threshold wording).
- **Read-only Mezo testnet oracle** — one live call: `latestRoundData()` on the Skip BTC/USD aggregator via viem (no wallet, no keys, no signing). Failures surface honestly; nothing is fabricated.
- **Documented protocol assumptions** — parameters pinned to official Mezo docs with inline citations; anything the docs don't state is a labelled, user-tunable assumption (see the Assumptions & Sources section in the app).
- **Simulated ≠ live** — DROPTEST never connects to a wallet or reads real troves; all simulations run client-side.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Recharts · viem · Vitest.

## Develop

```bash
npm install
npm run dev   # binds 0.0.0.0:${PORT:-3000}
```

## Test / verify

```bash
npm test        # vitest — engine unit tests
npx tsc --noEmit
```

## Routes

- `/` — overview: how it works, verified parameters, Mezo integration.
- `/lab` — the risk lab: position inputs, threshold assumption, ratio curve, crash timeline, preset + custom shocks, live oracle sync, assumptions & sources.

## Not financial advice

DROPTEST is a simulation tool built for the Mezo Buildathon. It does not connect to personal wallets or live positions, and it is not financial advice.
