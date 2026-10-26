import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "DROPTEST · Know where your position breaks",
  description:
    "See how a fall in Bitcoin's price affects a BTC-backed MUSD loan. Test different crash scenarios, find your liquidation price, and understand how much room your collateral has left.",
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
        <footer className="no-print border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-ink-faint sm:px-6">
            <p>
              DROPTEST models hypothetical positions. It does not connect to
              wallets, read live borrows, or give financial advice. Protocol
              parameters come from official Mezo documentation and are cited
              inline; anything the documentation does not state is treated as
              an assumption you can change.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
