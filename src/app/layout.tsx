import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DROPTEST — Bitcoin-collateral stress testing for Mezo",
  description:
    "Explore how BTC price crashes affect hypothetical BTC-backed MUSD borrowing positions on Mezo. Collateral ratio, distance to liquidation, and scenario risk — modelled with verified Mezo parameters.",
};

function Header() {
  return (
    <header className="border-b border-hairline bg-surface/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-ink text-[13px] font-bold text-background tabular">
            _/
          </span>
          <span className="text-sm font-semibold tracking-tight">DROPTEST</span>
          <span className="hidden rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-ink-faint sm:inline">
            Mezo buildathon
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-ink-soft transition-colors hover:text-ink">
            Overview
          </Link>
          <Link
            href="/lab"
            className="rounded-sm bg-ink px-3.5 py-1.5 font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Risk lab
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-ink-faint sm:px-6">
            <p>
              DROPTEST is a hypothetical simulation tool built for the Mezo
              Buildathon. It does not connect to personal wallets or live
              positions, and it is not financial advice. Protocol parameters
              referenced in the app are sourced from official Mezo
              documentation and cited inline; anything the documentation does
              not state is treated as a user-configurable assumption.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
