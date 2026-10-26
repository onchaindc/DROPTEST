import Link from "next/link";

import { MezoOracleBadge } from "@/components/mezo-oracle-badge";
import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  MEZO_TESTNET,
  SYSTEM_RECOVERY_MODE_TCR_PCT,
} from "@/lib/mezo/verified";

const steps = [
  {
    n: "01",
    title: "Define a hypothetical position",
    body: "Enter BTC collateral, total MUSD debt, and a spot BTC price. Everything is client-side — no wallet, no live position, no signed transaction.",
  },
  {
    n: "02",
    title: "Shock the price",
    body: "Drag a user-defined crash, load staged timelines, or compare preset severities from a modest rotation to a tail event. Every number recomputes live.",
  },
  {
    n: "03",
    title: "Read the risk",
    body: "Collateral ratio, LTV, the exact liquidation price, and how much further each scenario can fall before the position crosses the threshold.",
  },
];

const verified = [
  {
    k: `${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%`,
    label: "Individual liquidation threshold",
    note: "A trove is liquidatable when its collateral ratio falls below this — per Mezo's developer guide.",
    href: "https://mezo.org/docs/developers/musd/",
  },
  {
    k: `${SYSTEM_RECOVERY_MODE_TCR_PCT}%`,
    label: "Recovery Mode trigger (system TCR)",
    note: "A system-wide total-collateral-ratio trigger, documented separately from the per-position threshold.",
    href: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    k: "0.5% + 200 MUSD",
    label: "Liquidator reward & gas compensation",
    note: "The Stability Pool burns debt against seized collateral — no residual returned to the borrower in our model.",
    href: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    k: "1–5%",
    label: "Documented initial interest range",
    note: "Rates are not published beyond this range, so DROPTEST keeps entered debt static instead of inventing accrual.",
    href: "https://mezo.org/docs/users/borrow/mint-musd/",
  },
];

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-sm border border-hairline bg-surface-strong px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
            Mezo buildathon · BTC × MUSD
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Stress-test a BTC-backed MUSD loan
            <span className="text-ink-faint"> before the market does it for you.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            DROPTEST is a risk-notation desk for the Mezo ecosystem. Model a
            hypothetical BTC-collateral position, crash the price, and see
            exactly where your collateral ratio stands — down to the dollar at
            which the position becomes liquidatable.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/lab"
              className="w-fit rounded-sm bg-ink px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
            >
              Run a stress test →
            </Link>
            <Link
              href="#method"
              className="w-fit rounded-sm border border-hairline bg-surface-strong px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              How the numbers work
            </Link>
          </div>
          <div className="mt-10 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-sm border border-hairline bg-hairline sm:grid-cols-4">
            {[
              ["110%", "Documented liquidation threshold"],
              ["6", "Presets + user-defined shocks"],
              ["1", "Live oracle read — Mezo testnet"],
              ["0", "Wallet connections or fake data"],
            ].map(([k, v]) => (
              <div key={v} className="bg-surface-strong px-3 py-3">
                <p className="tabular text-lg font-semibold text-ink">{k}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="method" className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Three moves, no noise</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            The engine is a small, fully-tested module: collateral ratio = collateral
            value / total debt, liquidation price = threshold × debt / collateral, and
            the same two quantities re-evaluated at every shocked price. That is the
            whole model — which is exactly why you can trust the outputs.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="rounded-sm border border-hairline bg-surface-strong p-5"
              >
                <p className="tabular text-xs font-semibold text-ink-faint">{s.n}</p>
                <h3 className="mt-2 text-sm font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verified protocol parameters */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">
            Verified against Mezo documentation
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Where official docs state a parameter, DROPTEST pins it and cites the
            page. Where they don&apos;t — current interest rate, a named
            borrower-facing liquidation penalty — the app says so and leaves the
            input as a labelled assumption instead of fabricating a number.
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-hairline bg-hairline sm:grid-cols-2">
            {verified.map((v) => (
              <a
                key={v.label}
                href={v.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-surface-strong px-5 py-4 transition-colors hover:bg-background"
              >
                <p className="tabular text-xl font-semibold text-ink">{v.k}</p>
                <p className="mt-1 text-xs font-medium text-ink">{v.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{v.note}</p>
                <p className="mt-2 text-[11px] text-accent opacity-0 transition-opacity group-hover:opacity-100">
                  source doc ↗
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Mezo integration */}
      <section className="border-b border-hairline">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Mezo integration, kept honestly small
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              DROPTEST makes exactly one network call: a read-only{" "}
              <code className="tabular">latestRoundData()</code> against the Skip
              BTC/USD aggregator that Mezo&apos;s oracle documentation publishes
              for its testnet. It&apos;s wired through viem — no wallet, no key,
              no signing — and one click syncs the spot price in the lab. If the
              RPC is unreachable, the tool says so rather than guessing.
            </p>
            <ul className="mt-6 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li className="flex gap-3">
                <span className="tabular text-ink-faint">01</span>
                Mezo testnet · chain id{" "}
                <code className="tabular">{MEZO_TESTNET.chainId}</code> ·{" "}
                <code className="break-all">rpc.test.mezo.org</code>
              </li>
              <li className="flex gap-3">
                <span className="tabular text-ink-faint">02</span>
                Skip BTC/USD aggregator,{" "}
                <code className="break-all tabular">{MEZO_TESTNET.btcUsdAggregator}</code>
              </li>
              <li className="flex gap-3">
                <span className="tabular text-ink-faint">03</span>
                MUSD on testnet,{" "}
                <code className="break-all tabular">{MEZO_TESTNET.musd}</code>
              </li>
            </ul>
            <Link
              href="/lab"
              className="mt-7 inline-block rounded-sm bg-ink px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
            >
              Open the risk lab →
            </Link>
          </div>
          <MezoOracleBadge className="h-fit rounded-sm border border-hairline bg-surface-strong p-4" />
        </div>
      </section>

      {/* Closing CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Know your distance to liquidation — in one screen.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
            Take the starter position for a spin, load the staged crash
            timeline, and see the exact price where your hypothetical trove
            turns hostile.
          </p>
          <Link
            href="/lab"
            className="mt-8 inline-block rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Run a stress test →
          </Link>
        </div>
      </section>
    </main>
  );
}
