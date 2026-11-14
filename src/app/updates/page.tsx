import type { Metadata } from "next";
import Link from "next/link";

import { DOCUMENTED_FEES, FEES_SOURCE } from "@/lib/engine/fees";
import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  DEFAULT_MEZO_NETWORK as MEZO_NETWORK,
} from "@/lib/mezo/verified";

export const metadata: Metadata = {
  title: "Updates in Wave 2 · DROPTEST",
  description:
    "What shipped in DROPTEST Wave 2: live system health reads, borrow cost and interest drag, rescue planning, breakpoints, liquidation structure, historical replay, shareable links, CSV export and a fuller report.",
};

const features = [
  {
    n: "01",
    title: "Live system health, straight from the protocol",
    body: "The Stress Lab now reads the system the position lives in: MCR() and getTCR(price) from the TroveManager, and the live borrowingRate() and redemptionRate() from BorrowerOperations. It renders the system collateral ratio, whether Recovery Mode is active at the documented 150% trigger, and whether redemptions are open at the MCR — each labelled on-chain, with the chain id and block stated.",
    href: "/lab",
    hrefLabel: "Open Live reads",
  },
  {
    n: "02",
    title: "What a borrow actually costs",
    body: "A cost sheet for any MUSD amount: the documented 0.1% issuance fee, the 200 MUSD gas deposit that is locked until close, the net MUSD received, and the two readings of “paid in MUSD” side by side instead of quietly picking one.",
    href: "/lab",
    hrefLabel: "Open Costs & interest",
  },
  {
    n: "03",
    title: "Interest drag on the liquidation price",
    body: "Interest does not just grow debt; it lifts the liquidation price and eats headroom. The panel projects 30 / 90 / 180 / 365 days at any assumed fixed rate, shows the ratio drift at an unchanged price, and calculates the interest-only runway until the liquidation price reaches spot.",
    href: "/lab",
    hrefLabel: "Open Costs & interest",
  },
  {
    n: "04",
    title: "The liquidation split, and where bad debt starts",
    body: "At the threshold price, the seized collateral is split into the documented 0.5% liquidator reward, the 200 MUSD gas compensation and the remainder the Stability Pool uses to burn debt — plus a derived price below which that remainder no longer covers the debt.",
    href: "/lab",
    hrefLabel: "Open Costs & interest",
  },
  {
    n: "05",
    title: "Redemption exposure",
    body: "Redemptions start at the lowest collateral ratio above 110% and work upward, selling BTC at par. The panel simulates a redemption against your trove and shows something counter-intuitive: above 100% collateral, being redeemed at par raises your ratio because you lose equal dollar amounts from both sides.",
    href: "/lab",
    hrefLabel: "Open Costs & interest",
  },
  {
    n: "06",
    title: "Rescue planner",
    body: "Pick a crash and a ratio you want to hold, and read the two independent ways to get there: how much BTC to add, or how much MUSD to repay — sized at the shocked price, with the MCR-only variant one click away.",
    href: "/lab",
    hrefLabel: "Open Rescue & history",
  },
  {
    n: "07",
    title: "Breakpoint ladder",
    body: "The BTC price at which the position's ratio reaches 110 / 125 / 150 / 200 / 300%, with the distance from spot, so the risk lines are visible without dragging a slider.",
    href: "/lab",
    hrefLabel: "Open Rescue & history",
  },
  {
    n: "08",
    title: "Historical replay",
    body: "The documented drawdown references (COVID 2020, May 2021, the 2022 bear, the 2024 correction) applied once to your position, with the resulting ratio and a survival verdict. Context, never a forecast.",
    href: "/lab",
    hrefLabel: "Open Rescue & history",
  },
  {
    n: "09",
    title: "Shareable scenario links",
    body: "The lab encodes the four position numbers and the custom shock into the URL, and restores them on open. Strict parsing means a truncated or hand-edited link falls back to the sample position instead of half-applying a scenario.",
    href: "/lab",
    hrefLabel: "Copy a link from the lab",
  },
  {
    n: "10",
    title: "CSV risk-pack export",
    body: "One flat, RFC 4180-quoted CSV containing the position, the preset shocks, the timeline stages, the breakpoints and the historical replays — ready for a risk memo or a spreadsheet.",
    href: "/lab",
    hrefLabel: "Export from the lab",
  },
  {
    n: "11",
    title: "A report that carries the whole analysis",
    body: "The printable report gained the fee schedule, the interest-drag table, the rescue plan, the breakpoint ladder, the liquidation split and the historical replay, all recomputed from the snapshot and labelled with their provenance.",
    href: "/report",
    hrefLabel: "See the report",
  },
  {
    n: "12",
    title: "A bigger tested engine",
    body: "Five new pure modules — fees, interest, rescue, liquidation and historical replay — plus live protocol reads, link parsing and CSV export. 143 unit tests now cover the math, the boundaries and the failure modes; the live protocol selectors were verified against mainnet before shipping.",
    href: "/method",
    hrefLabel: "Read the methodology",
  },
];

const criteria = [
  {
    criterion: "Mezo integration",
    answer:
      "Six read-only calls across two protocol contracts now feed the product: the Skip BTC/USD oracle, getTroveStatus, getEntireDebtAndColl and Troves on the TroveManager, plus MCR, getTCR, borrowingRate and redemptionRate for system health. Fees, liquidity thresholds and redemption mechanics are modelled from the official docs, with citation.",
  },
  {
    criterion: "Product & business viability",
    answer:
      "The wave turns a shock calculator into the pre-borrow and pre-crash workflow: what the loan costs, what interest does over time, what a liquidation splits into, how much to add or repay before a crash, where the ratio lines sit, and a CSV/report to hand to someone else.",
  },
  {
    criterion: "Technical implementation",
    answer:
      "Pure, tested engine modules (fees, interest, rescue, liquidation, historical), explicit failure taxonomies for every chain read, chain-id guards before decoding, strict URL and snapshot sanitising, and 143 unit tests that pin the boundary wording (“falls below”, not “at”).",
  },
  {
    criterion: "User experience",
    answer:
      "Two new lab sections, one system-health panel, shareable links and one-click export keep every new capability inside the existing workflow. Every number carries a provenance label — on-chain, documented, calculated or assumed.",
  },
  {
    criterion: "Submission materials quality",
    answer:
      "This page, the expanded methodology page, the updated README, and a printable report that includes the new analysis with sources.",
  },
];

export default function UpdatesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-10">
        <p className="text-[11px] font-medium uppercase tracking-widest text-ink-faint">
          Wave 2 · November 2026
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Updates in this wave
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          DROPTEST already answered &ldquo;where does this position break?&rdquo;. This
          wave answers the questions that come next: what the borrow costs, what
          interest does to the line, what a liquidation actually splits into,
          what to add or repay before a crash, and how to hand the analysis to
          someone else.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/lab"
            className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Open the stress lab
          </Link>
          <Link
            href="/method"
            className="rounded-sm border border-hairline bg-surface-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Read the methodology
          </Link>
        </div>
      </header>

      <section className="mb-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {features.map((f) => (
          <article
            key={f.n}
            className="flex flex-col border border-hairline bg-surface-strong p-4"
          >
            <p className="tabular text-[11px] font-semibold text-ink-faint">{f.n}</p>
            <h2 className="mt-1.5 text-sm font-semibold text-ink">{f.title}</h2>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-soft">
              {f.body}
            </p>
            <Link
              href={f.href}
              className="mt-3 text-[11px] font-medium text-accent underline underline-offset-2"
            >
              {f.hrefLabel} →
            </Link>
          </article>
        ))}
      </section>

      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          How the wave maps to the judging criteria
        </h2>
        <dl className="mt-4 grid gap-5 md:grid-cols-2">
          {criteria.map((c) => (
            <div key={c.criterion} className="border-t border-hairline pt-3">
              <dt className="text-sm font-semibold text-ink">{c.criterion}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-soft">{c.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          What stayed the same
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">
          DROPTEST is still read-only by design: no wallet connection, no
          signing, no approvals, no transactions. Every new number is either
          read from the chain, quoted from the documentation, computed by the
          tested engine, or labelled as an assumption. The documented{" "}
          {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% per-trove liquidation line and
          the separate 150% system Recovery Mode trigger are still kept apart,
          and the app still refuses to invent a live interest rate.
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Live reads target {MEZO_NETWORK.label}, chain id {MEZO_NETWORK.chainId}.
          Fee schedule source:{" "}
          <a
            href={FEES_SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Mezo docs · MUSD fees
          </a>
          . The whole documented schedule:
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-soft">
          {DOCUMENTED_FEES.map((fee) => (
            <li key={fee.id}>
              <span className="font-medium text-ink">{fee.label}</span>{" "}
              <span className="tabular">{fee.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
