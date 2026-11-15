import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

import { SiteNav } from "@/components/site-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DROPTEST · BTC collateral risk for Mezo MUSD",
  description:
    "Model a BTC-backed MUSD position on Mezo, stress it against real crash paths, and read the exact liquidation price, cost and headroom. Read-only, no wallet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="no-print">
          <SiteNav />
        </div>
        <div className="flex-1">{children}</div>
        <footer className="no-print border-t border-hairline bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="tabular flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[12px] font-bold text-white">
                    _/
                  </span>
                  <span className="text-sm font-semibold tracking-tight">DROPTEST</span>
                </div>
                <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-faint">
                  Read-only risk research for BTC-collateral borrowing on Mezo.
                  No wallet connection, no signing, no transactions — ever.
                </p>
              </div>
              <nav aria-label="Tools" className="flex flex-col gap-2 text-xs">
                <p className="eyebrow">Tools</p>
                <Link href="/lab" className="text-ink-soft transition-colors hover:text-ink">
                  Stress Lab
                </Link>
                <Link href="/studio" className="text-ink-soft transition-colors hover:text-ink">
                  Scenario Studio
                </Link>
                <Link href="/report" className="text-ink-soft transition-colors hover:text-ink">
                  Printable report
                </Link>
              </nav>
              <nav aria-label="Reference" className="flex flex-col gap-2 text-xs">
                <p className="eyebrow">Reference</p>
                <Link href="/method" className="text-ink-soft transition-colors hover:text-ink">
                  Research &amp; methodology
                </Link>
                <a
                  href="https://mezo.org/docs/developers/musd/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-soft transition-colors hover:text-ink"
                >
                  Mezo mUSD docs ↗
                </a>
                <a
                  href="https://github.com/onchaindc/DROPTEST"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-soft transition-colors hover:text-ink"
                >
                  Source on GitHub ↗
                </a>
              </nav>
            </div>
            <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-ink-faint">
              Hypothetical analysis only, not financial advice. Protocol parameters
              are quoted from official Mezo documentation and cited inline; anything
              the documentation does not state is an assumption you can change.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
