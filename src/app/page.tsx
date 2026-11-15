import Link from "next/link";

import { HeroSnapshot } from "@/components/hero-snapshot";
import { MezoOracleBadge } from "@/components/mezo-oracle-badge";
import { LivePositionWatch } from "@/components/live-position-watch";
import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  DEFAULT_MEZO_NETWORK as MEZO_NETWORK,
  SYSTEM_RECOVERY_MODE_TCR_PCT,
} from "@/lib/mezo/verified";
import {
  GAS_DEPOSIT_MUSD,
  ISSUANCE_FEE_PCT,
  REDEMPTION_FEE_PCT,
} from "@/lib/engine/fees";

const steps = [
  {
    n: "01",
    title: "Describe the position",
    body: "Enter BTC collateral, MUSD debt and a BTC price — or load a real open trove by public address, read-only, straight from the Mezo TroveManager.",
  },
  {
    n: "02",
    title: "Stress the price",
    body: "Walk the preset severity ladder, build a staged crash timeline, or solve backwards from a ratio you want to hold.",
  },
  {
    n: "03",
    title: "Read the answer",
    body: "Liquidation price, distance to it, what a top-up or repayment would buy you, what interest does over time, and what a liquidation splits into.",
  },
];

const tools = [
  {
    href: "/lab",
    kicker: "One position, every angle",
    title: "Stress Lab",
    body: "Shocks, reverse stress, charts, costs, interest drag, rescue sizing, live trove lookup and live system health — in one workspace.",
    cta: "Open the Stress Lab",
  },
  {
    href: "/studio",
    kicker: "Gradual vs sudden",
    title: "Scenario Studio",
    body: "Compare up to three named price paths against the same position: which path breaches first, how low the ratio goes, what the collateral is worth at the end.",
    cta: "Compare paths",
  },
  {
    href: "/method",
    kicker: "Nothing hidden",
    title: "Methodology",
    body: "Every formula, the documented 110% per-trove line versus the 150% Recovery Mode trigger, liquidation mechanics, fee schedule and citations.",
    cta: "Read the methodology",
  },
];

const facts = [
  {
    value: `${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%`,
    label: "Per-trove liquidation line",
    note: "A trove is liquidatable when its collateral ratio falls below it.",
    href: "https://mezo.org/docs/developers/musd/",
  },
  {
    value: `${SYSTEM_RECOVERY_MODE_TCR_PCT}%`,
    label: "Recovery Mode (system TCR)",
    note: "A market-wide trigger, not a line your position crosses.",
    href: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    value: `${ISSUANCE_FEE_PCT}%`,
    label: "Issuance fee",
    note: `Paid in MUSD on open, plus a ${GAS_DEPOSIT_MUSD} MUSD gas deposit returned on close.`,
    href: "https://mezo.org/docs/users/musd/fees",
  },
  {
    value: `${REDEMPTION_FEE_PCT}%`,
    label: "Redemption fee",
    note: "Paid when MUSD is swapped for BTC, waived while you have a loan open.",
    href: "https://mezo.org/docs/developers/musd/musd-redemptions",
  },
];

const assumptions = [
  {
    label: "Spot BTC price",
    body: "You type it, or sync it once from the read-only Mezo oracle. No background polling.",
  },
  {
    label: "Liquidation threshold",
    body: `Defaults to the documented ${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%. Moving the slider is an explicit what-if.`,
  },
  {
    label: "Interest rate",
    body: "Not published live by the protocol. Any projection uses a rate you choose, labelled as an assumption.",
  },
  {
    label: "Shocks and paths",
    body: "Illustrative severities you control — not predictions, not protocol data.",
  },
];

const faqs = [
  {
    q: "Does DROPTEST touch my wallet?",
    a: "No. There is no wallet connection, no signing, no approvals and no transactions anywhere in the product. You either type a hypothetical position or paste a public address, and the app makes read-only view calls to Mezo mainnet.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Protocol parameters are quoted from official Mezo documentation with inline links, and live values (BTC/USD oracle, MCR, system TCR, fees, open troves) are read directly from the chain with the connected chain id checked first. Anything the docs do not state is shown as an assumption you can change.",
  },
  {
    q: "Why 110% and 150%?",
    a: "110% is the per-trove line: below it, that position can be liquidated. 150% is the system-wide Recovery Mode trigger on the whole market's total collateral ratio. They are different numbers for different things, and the app keeps them apart.",
  },
  {
    q: "What actually happens if the position is liquidated?",
    a: "Per the mUSD documentation the liquidator receives 0.5% of the collateral plus a 200 MUSD gas compensation, and the Stability Pool burns MUSD against the debt and seizes the rest. The documentation publishes no borrower residual, so DROPTEST models the borrower keeping nothing.",
  },
  {
    q: "Is this financial advice or a forecast?",
    a: "Neither. Every scenario is a hypothetical what-if you define. The app does not predict prices, does not recommend borrowing, and cannot execute anything.",
  },
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-accent" fill="none">
      <path
        d="M4 10.5 8 14l8-8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none">
      <path
        d="M4 10h11M11 5.5 15.5 10 11 14.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-hairline">
        <div className="dot-grid absolute inset-0 opacity-60" aria-hidden />
        <div
          className="absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="chip">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              BTC-collateral risk on Mezo · read-only
            </span>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Know exactly where your BTC loan breaks.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
              Model a BTC-backed MUSD position, crash the price, and read the exact
              liquidation level — plus what the borrow costs, what interest does
              to that line, and what to add before the drop.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/lab" className="btn btn-primary px-5 py-3 text-[15px]">
                Open the Stress Lab
                <Arrow />
              </Link>
              <Link href="/studio" className="btn btn-secondary px-5 py-3 text-[15px]">
                Compare scenarios
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
              {["No wallet connection", "No signing", "Live Mezo oracle", "Every formula tested"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <HeroSnapshot />
        </div>
      </section>

      {/* Verified protocol band */}
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto grid max-w-6xl gap-px px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {facts.map((fact) => (
            <a
              key={fact.label}
              href={fact.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl px-4 py-4 transition-colors hover:bg-background"
            >
              <p className="tabular text-2xl font-semibold tracking-tight text-ink">
                {fact.value}
              </p>
              <p className="mt-1 text-xs font-medium text-ink">{fact.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{fact.note}</p>
              <p className="mt-2 text-[11px] text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Source ↗
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Three steps from a position to a price.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.n} className="card p-5">
                <p className="tabular text-xs font-semibold text-ink-faint">{step.n}</p>
                <h3 className="mt-2 text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">The workspace</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Three ways into the same model.
              </h2>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-ink-soft">
              One tested engine backs all of them: ratio = collateral value ÷ debt,
              and liquidation price = threshold × debt ÷ collateral, re-evaluated at
              every price you ask about.
            </p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {tools.map((tool) => (
              <Link key={tool.href} href={tool.href} className="card group flex flex-col p-5 transition-transform hover:-translate-y-0.5">
                <p className="eyebrow">{tool.kicker}</p>
                <h3 className="mt-1.5 text-base font-semibold text-ink">{tool.title}</h3>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-soft">{tool.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                  {tool.cta}
                  <Arrow />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Verified vs assumed */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="eyebrow">No invented numbers</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Pinned to the docs, or labelled as an assumption.
          </h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-accent">
                  Verified
                </span>
                Documented protocol behaviour
              </h3>
              <ul className="mt-4 space-y-3">
                {[
                  "The 110% per-trove liquidation line and the 150% system Recovery Mode trigger are modelled separately.",
                  "Liquidation mechanics: 0.5% liquidator reward, 200 MUSD gas compensation, Stability Pool absorbs the rest.",
                  "The fee schedule: 0.1% issuance, 0.75% redemption, 1–5% fixed interest at open.",
                  "Live values are read from Mezo mainnet — oracle price, MCR, system TCR, live fee rates and open troves.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-xs leading-relaxed text-ink-soft">
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="rounded-full border border-amber/30 bg-amber/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber">
                  Assumed
                </span>
                Yours to change
              </h3>
              <dl className="mt-4 space-y-3">
                {assumptions.map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs font-medium text-ink">{item.label}</dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-ink-soft">{item.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Live reads */}
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="eyebrow">Live, read-only</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Check the numbers against the chain.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
              DROPTEST reads Mezo mainnet (chain id {MEZO_NETWORK.chainId}) with
              plain view calls: the Skip BTC/USD oracle, the system collateral
              ratio and fee rates, and any public address&apos;s open trove. One
              click syncs the oracle price into the model; reading a real
              position loads it with on-chain and calculated values labelled
              separately.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Chain id is verified before any contract data is decoded, so mainnet and testnet can never blend.",
                "A stale oracle reading is flagged, never passed off as live.",
                "A failed call is reported as a failed call — no placeholder prices, no invented positions.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/lab" className="btn btn-primary mt-7 px-5 py-3">
              Open the Stress Lab
              <Arrow />
            </Link>
          </div>
          <div className="flex flex-col gap-4 self-start">
            <MezoOracleBadge network={MEZO_NETWORK} />
            <LivePositionWatch network={MEZO_NETWORK} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-hairline">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Questions</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              The obvious ones, answered.
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              More detail lives on the{" "}
              <Link href="/method" className="text-accent underline underline-offset-2">
                methodology page
              </Link>
              , including sources and the one wording conflict in Mezo&apos;s docs.
            </p>
          </div>
          <div className="divide-y divide-hairline border-y border-hairline">
            {faqs.map((faq) => (
              <details key={faq.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink">
                  {faq.q}
                  <span
                    aria-hidden
                    className="text-lg leading-none text-ink-faint transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="card relative overflow-hidden p-8 text-center sm:p-12">
            <div
              className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/10 to-transparent"
              aria-hidden
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Find your distance to liquidation in one screen.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
                Start from a sample position, crash the price, then print the report
                and keep it.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/lab" className="btn btn-primary px-5 py-3">
                  Open the Stress Lab
                  <Arrow />
                </Link>
                <Link href="/method" className="btn btn-secondary px-5 py-3">
                  Read the methodology
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
