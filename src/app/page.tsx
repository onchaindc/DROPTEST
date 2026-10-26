import Link from "next/link";

import { MezoOracleBadge } from "@/components/mezo-oracle-badge";
import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  DEFAULT_MEZO_NETWORK as MEZO_NETWORK,
  SYSTEM_RECOVERY_MODE_TCR_PCT,
} from "@/lib/mezo/verified";

const sections = [
  {
    href: "/lab",
    title: "Stress Lab",
    body: "Enter a hypothetical position, drop the Bitcoin price, and read the collateral ratio, liquidation price, and remaining headroom for each shock.",
    cta: "Open the stress lab",
  },
  {
    href: "/studio",
    title: "Scenario Studio",
    body: "Compare up to three named price paths side by side. Gradual decline, sudden crash, and prolonged bear market presets, with your own edits.",
    cta: "Compare scenarios",
  },
  {
    href: "/method",
    title: "Research & Methodology",
    body: "The formulas behind the numbers, the documented 110% liquidation threshold, Recovery Mode, liquidation mechanics, and every source we cite.",
    cta: "How the model works",
  },
];

const steps = [
  {
    n: "01",
    title: "Define a hypothetical position",
    body: "Enter BTC collateral, total MUSD debt, and a spot BTC price — or load a real trove by public address, read-only, right in the lab. Everything runs in your browser. No wallet, no signed transaction.",
  },
  {
    n: "02",
    title: "Shock the price",
    body: "Drag a custom crash, load preset shocks, or walk a staged timeline. You can also invert the question: pick a collateral ratio and solve for the price that hits it.",
  },
  {
    n: "03",
    title: "Read the risk",
    body: "The engine returns the collateral ratio, LTV, the exact liquidation price, and how much further each scenario can fall before the position crosses the threshold.",
  },
];

const verified = [
  {
    k: `${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%`,
    label: "Individual liquidation threshold",
    note: "A trove is liquidatable when its collateral ratio falls below this. Source: Mezo developer guide.",
    href: "https://mezo.org/docs/developers/musd/",
  },
  {
    k: `${SYSTEM_RECOVERY_MODE_TCR_PCT}%`,
    label: "Recovery Mode trigger (system TCR)",
    note: "A system-wide total collateral ratio trigger, separate from the per-position threshold.",
    href: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    k: "0.5% + 200 MUSD",
    label: "Liquidator reward and gas compensation",
    note: "The Stability Pool burns debt against seized collateral. The borrower is modelled as keeping nothing from liquidation.",
    href: "https://github.com/mezo-org/musd/blob/main/docs/README.md",
  },
  {
    k: "1 to 5%",
    label: "Documented initial interest range",
    note: "The current rate is not published, so the calculator keeps your entered debt static instead of guessing accrual.",
    href: "https://mezo.org/docs/users/borrow/mint-musd/",
  },
];

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Know where your position breaks.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            See how a fall in Bitcoin&apos;s price affects a BTC-backed MUSD
            loan. Test different crash scenarios, find your liquidation price,
            and understand how much room your collateral has left.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/lab"
              className="w-fit rounded-sm bg-ink px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
            >
              Open the stress lab
            </Link>
            <Link
              href="/studio"
              className="w-fit rounded-sm border border-hairline bg-surface-strong px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              Compare scenarios
            </Link>
            <Link
              href="/method"
              className="w-fit px-5 py-3 text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            >
              How the model works
            </Link>
          </div>
          <div className="mt-10 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-sm border border-hairline bg-hairline sm:grid-cols-4">
            {[
              [`${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}%`, "Documented liquidation threshold"],
              ["3", "Compared price paths, plus shocks"],
              ["2", "Live read flows: oracle + open troves"],
              ["0", "Wallet connections or invented data"],
            ].map(([k, v]) => (
              <div key={v} className="bg-surface-strong px-3 py-3">
                <p className="tabular text-lg font-semibold text-ink">{k}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three tools, mapped */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Three tools, one model</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            The engine is a small, tested module. Collateral ratio equals
            collateral value divided by total debt. Liquidation price equals
            threshold times debt divided by collateral. The same two formulas
            are re-evaluated at every price the scenarios ask about.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {sections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group flex flex-col rounded-sm border border-hairline bg-surface-strong p-5 transition-colors hover:border-ink"
              >
                <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-soft">{s.body}</p>
                <span className="mt-3 text-[11px] font-medium text-accent">
                  {s.cta} <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How the model works, briefly */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">How the model works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="border-t border-hairline pt-4">
                <p className="tabular text-xs font-semibold text-ink-faint">{s.n}</p>
                <h3 className="mt-2 text-sm font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
          <Link
            href="/method"
            className="mt-6 inline-block text-[11px] font-medium text-accent underline underline-offset-2"
          >
            Read the full methodology, sources, and limitations →
          </Link>
        </div>
      </section>

      {/* Verified protocol parameters */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">
            Pinned to official Mezo documentation
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Where the docs state a parameter, DROPTEST pins it and cites the
            page. Where they do not, such as the current interest rate or a
            borrower-facing liquidation penalty, the app says so and leaves
            the number as a labelled assumption instead of inventing one.
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
              Live reads, read-only
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              DROPTEST reads live on{" "}
              {MEZO_NETWORK.label} (chain id{" "}
              <code className="tabular">{MEZO_NETWORK.chainId}</code>): the
              documented Skip BTC/USD oracle{" "}
              <code className="tabular">latestRoundData()</code>, and — in the
              stress lab — open troves by public address on the TroveManager
              proxy. Both are plain read-only eth_calls through viem: no
              wallet, no key, no signing. One click syncs the spot price, and
              reading a real position loads it into the hypothetical inputs
              with on-chain/calculated labels so the two never blend. If a
              call fails, the tool tells you instead of guessing.
            </p>
            <ul className="mt-6 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li className="flex gap-3">
                <span className="tabular text-ink-faint">01</span>
                {MEZO_NETWORK.label}, chain id{" "}
                <code className="tabular">{MEZO_NETWORK.chainId}</code>, RPC{" "}
                <code className="break-all">mezo-mainnet.boar.network</code>
              </li>
              <li className="flex gap-3">
                <span className="tabular text-ink-faint">02</span>
                Skip BTC/USD aggregator,{" "}
                <code className="break-all tabular">{MEZO_NETWORK.contracts.btcUsdAggregator}</code>
              </li>
              <li className="flex gap-3">
                <span className="tabular text-ink-faint">03</span>
                TroveManager proxy{" "}
                <code className="break-all tabular">{MEZO_NETWORK.contracts.troveManager}</code>{" "}
                and MUSD{" "}
                <code className="break-all tabular">{MEZO_NETWORK.contracts.musd}</code>
              </li>
            </ul>
            <Link
              href="/lab"
              className="mt-7 inline-block rounded-sm bg-ink px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
            >
              Open the stress lab
            </Link>
          </div>
          <div className="self-start">
            <MezoOracleBadge
              network={MEZO_NETWORK}
              className="rounded-sm border border-hairline bg-surface-strong p-4"
            />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Find your distance to liquidation in one screen.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
            Start with the sample position, load a crash path, and see the
            exact price where your hypothetical position crosses the
            threshold. Then print the report and keep it.
          </p>
          <Link
            href="/lab"
            className="mt-8 inline-block rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Open the stress lab
          </Link>
        </div>
      </section>
    </main>
  );
}
