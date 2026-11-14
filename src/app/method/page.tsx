import type { Metadata } from "next";
import Link from "next/link";

import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  DEFAULT_MEZO_NETWORK as MEZO_NETWORK,
  SYSTEM_RECOVERY_MODE_TCR_PCT,
} from "@/lib/mezo/verified";
import { HISTORICAL_CRASHES } from "@/lib/engine/historical";
import {
  DOC_CONFLICTS,
  DOCUMENTED_FEES,
  FEES_SOURCE,
  REDEMPTION_MECHANICS_SOURCE,
} from "@/lib/engine/fees";
import {
  LIQUIDATION_DOCS_SOURCE,
  LIQUIDATOR_REWARD_PCT,
  LIQUIDATION_GAS_COMPENSATION_MUSD,
} from "@/lib/engine/liquidation";

export const metadata: Metadata = {
  title: "Research & Methodology · DROPTEST",
  description:
    "The formulas behind DROPTEST, the documented 110% liquidation threshold versus Recovery Mode, liquidation mechanics, interest limitations, and the read-only oracle source.",
};

const DOC_LINKS = [
  {
    label: "Mezo developer guide: mUSD",
    href: "https://mezo.org/docs/developers/musd/",
    note: "Collateral ratio definition and the 110% liquidation rule.",
  },
  {
    label: "mUSD documentation (musd repo docs)",
    href: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
    note: "Recovery Mode at 150% TCR, Stability Pool liquidations, gas compensation, liquidator reward.",
  },
  {
    label: "Mezo docs: minting mUSD",
    href: "https://mezo.org/docs/users/borrow/mint-musd/",
    note: "0.1% borrowing charge and the 1% to 5% initial fixed interest range.",
  },
  {
    label: "Mezo docs: oracle architecture",
    href: "https://mezo.org/docs/developers/architecture/oracles/",
    note: "The Skip BTC/USD aggregator address used for the read-only price call.",
  },
  {
    label: "Mezo docs: MUSD fees and costs",
    href: FEES_SOURCE,
    note: "Issuance 0.1%, fixed interest 1–5%, redemption 0.75% (waived for borrowers), refinance, and the flat 200 MUSD gas deposit returned on close.",
  },
  {
    label: "Mezo docs: MUSD redemptions",
    href: REDEMPTION_MECHANICS_SOURCE,
    note: "Redemption starts at the lowest collateral ratio above 110%, and requires the system TCR to be at or above the MCR.",
  },
  {
    label: "Mezo docs: getting started / connect",
    href: "https://mezo.org/docs/users/getting-started/connect/",
    note: "Mainnet chain id 31612, RPC, and explorer endpoints; testnet 31611 remains documented alongside.",
  },
  {
    label: "Older borrow blog (documented conflict)",
    href: "https://mezo.org/blog/borrow-against-your-bitcoin-with-musd/",
    note: "An older page wrote that loans under 150% collateral risk liquidation. It conflicts with the current developer guide's single 110% process.",
  },
];

const verifiedFacts = [
  {
    value: `${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%`,
    label: "Per-position liquidation threshold",
    note: "Docs: all loan positions must maintain a collateral ratio above 110%.",
  },
  {
    value: `${SYSTEM_RECOVERY_MODE_TCR_PCT}%`,
    label: "Recovery Mode trigger (system TCR)",
    note: "Docs: Recovery Mode is activated if the total collateral ratio falls below 150%.",
  },
  {
    value: "0.5% + 200 MUSD",
    label: "Liquidator reward and gas compensation",
    note: "Docs: liquidators receive a share of collateral plus a gas compensation paid in MUSD.",
  },
  {
    value: "0.1% · 1 to 5%",
    label: "Borrowing charge and initial interest range",
    note: "Docs: a governable 0.1% borrowing charge; initial fixed interest ranged 1% to 5%.",
  },
];

const adjustableAssumptions = [
  {
    value: "Spot BTC price",
    label: "You type it",
    note: "Or sync it once from the read-only mainnet oracle. The app never fetches prices in the background.",
  },
  {
    value: "Position size",
    label: "You type it — or load a live trove",
    note: "Hypothetical amounts by default; the Stress Lab can also load a real open trove by public EVM address from the mainnet TroveManager, strictly read-only.",
  },
  {
    value: "Liquidation threshold",
    label: "Slider, 100% to 200%",
    note: `Defaults to the documented ${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%. Moving it is an explicit what-if, labelled as such in the charts.`,
  },
  {
    value: "Preset shocks and paths",
    label: "Static percent defaults",
    note: "Illustrative severities and shapes, not predictions and not protocol data.",
  },
  {
    value: "Interest rate (optional)",
    label: "Simple fixed-rate assumption",
    note: "1–5% range is documented; the live rate is not published. A projection over 30/90/180 days is therefore an explicit user assumption, never a protocol fact.",
  },
];

export default function MethodPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Research & Methodology
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every number DROPTEST shows, where it comes from, and what it does
          not claim. Protocol parameters are pinned to official Mezo
          documentation with links. Anything the documentation does not state
          is labelled as an assumption you can change.
        </p>
      </header>

      {/* Formulas */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">The formulas</h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">
          Three formulas cover everything on the site. They are implemented as
          pure functions in one tested module, so the UI cannot disagree with
          the math.
        </p>
        <dl className="mt-5 grid gap-5 md:grid-cols-3">
          {[
            {
              term: "Collateral ratio",
              formula: "ratio = collateralValue / totalDebt",
              detail:
                "Collateral value is BTC quantity times the BTC price. At a $67,000 price, 0.25 BTC against 11,165 MUSD of debt gives about 150%.",
            },
            {
              term: "Liquidation price",
              formula: "price = threshold × debt / (100 × btc)",
              detail:
                `The price at which the ratio equals the threshold. Below it, the position is liquidatable. With the documented ${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% threshold, 11,165 MUSD of debt and 0.25 BTC liquidates at $49,126.`,
            },
            {
              term: "Reverse stress",
              formula: "price = targetRatio × debt / (100 × btc)",
              detail:
                "The same algebra run backwards: you choose a ratio target, the model solves for the price that puts you there. It is a what-if, not the documented threshold.",
            },
          ].map((f) => (
            <div key={f.term} className="border-t border-hairline pt-3">
              <dt className="text-sm font-semibold text-ink">{f.term}</dt>
              <dd className="mt-1.5">
                <code className="tabular block border border-hairline bg-background px-2 py-1.5 text-[11px]">
                  {f.formula}
                </code>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                  {f.detail}
                </p>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-faint">
          The two boundary rules worth knowing: equality with the threshold is
          not liquidatable, because the documentation says a trove is
          liquidatable when the ratio <em>falls below</em> 110%; and a 100%
          price drop floors the collateral value at zero rather than going
          negative. Both are covered by unit tests.
        </p>
      </section>

      {/* Threshold vs Recovery Mode */}
      <section className="mb-12 grid gap-6 lg:grid-cols-2">
        <div className="border border-hairline bg-surface-strong p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            The threshold, and why Recovery Mode is different
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Two numbers get confused in discussions of Mezo borrowing, and
            DROPTEST keeps them apart on purpose.
          </p>
          <div className="mt-4 space-y-4 text-xs leading-relaxed">
            <div className="border-l-2 border-accent pl-3">
              <p className="font-medium text-ink">
                {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%: per-position liquidation
                threshold
              </p>
              <p className="mt-1 text-ink-soft">
                The developer guide states that loan positions must maintain a
                collateral ratio above {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%,
                and a trove can be liquidated when its ratio falls below it.
                This is the number the calculator uses.
              </p>
            </div>
            <div className="border-l-2 border-amber pl-3">
              <p className="font-medium text-ink">
                {SYSTEM_RECOVERY_MODE_TCR_PCT}%: Recovery Mode, system-wide
              </p>
              <p className="mt-1 text-ink-soft">
                Recovery Mode activates when the whole system&apos;s total
                collateral ratio (TCR) falls below {SYSTEM_RECOVERY_MODE_TCR_PCT}%
                and enforces stricter borrowing rules until it recovers. It is
                a market-level condition, not a line your individual position
                crosses, so it is shown here as context only.
              </p>
            </div>
          </div>
          <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
            Disclosed conflict: an older Mezo blog wrote that loans under 150%
            collateral &quot;risk liquidation&quot;, which reads like a
            per-position rule and contradicts the current developer guide. The
            calculator follows the current guide and does not silently merge
            the two.
          </p>
        </div>

        <div className="border border-hairline bg-surface-strong p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            Liquidation mechanics and what the model shows
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Per the mUSD documentation, a liquidation hands the trove&apos;s
            collateral to the liquidation process. The liquidator receives a{" "}
            <span className="tabular">0.5%</span> share plus{" "}
            <span className="tabular">200 MUSD</span> of gas compensation. The
            Stability Pool then burns MUSD against the trove&apos;s debt and
            seizes the remaining collateral.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            DROPTEST models the practical outcome the docs describe: a
            liquidated borrower keeps nothing. That is why the lab reports the
            value at liquidation as the threshold fraction of debt, not the
            full collateral value, and why there is no &quot;amount you get
            back&quot; row.
          </p>
          <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-soft">
            Interest is deliberately excluded from the shock and path math, so
            every scenario compares positions with the same debt. Mezo documents
            a governable <span className="tabular">0.1%</span> borrowing charge
            and initial fixed rates between{" "}
            <span className="tabular">1% and 5%</span>, but the live rate is not
            published — so the Interest drag panel projects a rate you choose
            (or the rate read from a loaded trove) and labels it an assumption.
          </p>
        </div>
      </section>

      {/* Documented fees */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Documented fees, and what is derived from them
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">
          The cost model quotes the official fee page. It does not assume those
          values still hold on-chain: the Live reads section calls{" "}
          <code className="tabular">borrowingRate()</code> and{" "}
          <code className="tabular">redemptionRate()</code> on BorrowerOperations
          and shows what the protocol answers right now, separately from the
          documentation.
        </p>
        <dl className="mt-4 divide-y divide-hairline border-t border-hairline text-xs">
          {DOCUMENTED_FEES.map((fee) => (
            <div key={fee.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
              <dt className="font-medium text-ink">{fee.label}</dt>
              <dd className="tabular text-ink-soft">{fee.value}</dd>
              <dd className="w-full text-[11px] text-ink-faint sm:w-auto">
                {fee.charged}
              </dd>
            </div>
          ))}
        </dl>
        {DOC_CONFLICTS.map((conflict) => (
          <p
            key={conflict.topic}
            className="mt-3 border-l-2 border-amber pl-3 text-[11px] leading-relaxed text-amber"
          >
            {conflict.topic}: the docs disagree ({conflict.first} vs{" "}
            {conflict.second}). {conflict.note}
          </p>
        ))}
        <p className="mt-4 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-soft">
          Two numbers in the app are <em>derived</em> from these documented
          parameters rather than quoted from them. The liquidation split uses
          the {LIQUIDATOR_REWARD_PCT}% liquidator share and the{" "}
          {LIQUIDATION_GAS_COMPENSATION_MUSD} MUSD gas compensation; the
          bad-debt price is the BTC price at which 99.5% of the seized
          collateral no longer covers the debt plus that compensation. The
          redemption what-if removes debt and BTC at par, and notes that the
          app cannot see the rest of the system&apos;s trove order from a single
          position. Sources:{" "}
          <a href={FEES_SOURCE} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
            fees
          </a>{" "}
          and{" "}
          <a href={LIQUIDATION_DOCS_SOURCE} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
            liquidation mechanics
          </a>
          .
        </p>
      </section>

      {/* Historical reference */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Historical reference drops
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">
          These are educational context only — approximate peak-to-trough
          figures so you can ask how a position would have looked during past
          drawdowns. They are not predictions, not protocol data, and not
          wired into the risk engine.
        </p>
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline text-sm">
          {HISTORICAL_CRASHES.map((h) => (
            <li key={h.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-ink">{h.name}</span>
                <span className="tabular text-xs text-ink-faint">
                  −{h.dropPct}% · {h.period}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">{h.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Verified vs adjustable */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Verified parameters vs adjustable assumptions
        </h2>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-accent">
              Pinned to docs, not editable
            </h3>
            <dl className="mt-3 divide-y divide-hairline border-t border-hairline">
              {verifiedFacts.map((v) => (
                <div key={v.label} className="py-2.5">
                  <dt className="text-xs">
                    <span className="tabular font-semibold">{v.value}</span>{" "}
                    <span className="text-ink-soft">{v.label}</span>
                  </dt>
                  <dd className="mt-0.5 text-[11px] text-ink-faint">{v.note}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-amber">
              Assumptions, editable by design
            </h3>
            <dl className="mt-3 divide-y divide-hairline border-t border-hairline">
              {adjustableAssumptions.map((a) => (
                <div key={a.value} className="py-2.5">
                  <dt className="text-xs">
                    <span className="font-semibold">{a.value}</span>{" "}
                    <span className="text-ink-soft">{a.label}</span>
                  </dt>
                  <dd className="mt-0.5 text-[11px] text-ink-faint">{a.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Oracle */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">Live reads, read-only</h2>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-soft">
          Read-only eth_calls against{" "}
          {MEZO_NETWORK.label} (chain id{" "}
          <code className="tabular">{MEZO_NETWORK.chainId}</code>, RPC{" "}
          <code className="break-all">{MEZO_NETWORK.rpc}</code>, all
          addresses from the official docs and verified live before use):
          the Skip BTC/USD aggregator{" "}
          <code className="break-all tabular">
            {MEZO_NETWORK.contracts.btcUsdAggregator}
          </code>{" "}
          via <code className="tabular">latestRoundData()</code> and{" "}
          <code className="tabular">decimals()</code>, and the TroveManager proxy{" "}
          <code className="break-all tabular">
            {MEZO_NETWORK.contracts.troveManager}
          </code>{" "}
          via <code className="tabular">getTroveStatus(address)</code>,{" "}
          <code className="tabular">getEntireDebtAndColl(address)</code>,{" "}
          <code className="tabular">Troves(address)</code>,{" "}
          <code className="tabular">MCR()</code> and{" "}
          <code className="tabular">getTCR(price)</code>, plus{" "}
          <code className="tabular">borrowingRate()</code> and{" "}
          <code className="tabular">redemptionRate()</code> on BorrowerOperations.{" "}
          Nothing is ever written: no wallet, no key, no signing. The system{" "}
          panel turns those reads into the system collateral ratio, the Recovery
          Mode flag at 150% and the redemption gate at the MCR.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-soft">
          <li>
            The reading shows its own timestamp, so you can judge how fresh it
            is. Per the docs the feed updates every block; readings older
            than ten minutes are flagged as stale.
          </li>
          <li>
            If the RPC is unreachable, the chain id mismatches, or the
            contracts return junk, the app reports the error and invents no
            price or position. Manual prices you type are labelled as hand
            entry and never silently replaced.
          </li>
          <li>
            The oracle price and any shock scenarios are separate: shocks
            always apply to the price you are working from.
          </li>
        </ul>
      </section>

      {/* Sources */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {DOC_LINKS.map((d) => (
            <li key={d.href} className="border-t border-hairline pt-2">
              <a
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-ink underline decoration-accent underline-offset-4"
              >
                {d.label}
              </a>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
                {d.note}{" "}
                <span className="break-all">{d.href.replace("https://", "")}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Closing */}
      <section className="mb-4 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Simulated is not real
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">
          Every position on this site is hypothetical unless you explicitly
          load one by public address. DROPTEST never connects a wallet and never
          signs anything; the only live reads are view calls, and they never
          present a simulated position as a real Mezo borrow. The engine, its
          tests, and this page exist so you can check every claimed number
          yourself. Use{" "}
          <Link href="/lab" className="text-accent underline underline-offset-2">
            the stress lab
          </Link>{" "}
          to run the numbers, or{" "}
          <Link href="/studio" className="text-accent underline underline-offset-2">
            the scenario studio
          </Link>{" "}
          to compare price paths.
        </p>
      </section>
    </main>
  );
}
