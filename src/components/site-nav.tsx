"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();
  const inLab = pathname === "/lab" || pathname === "/report";

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-ink text-[13px] font-bold text-background">
            _/
          </span>
          <span className="text-sm font-semibold tracking-tight">DROPTEST</span>
          <span className="hidden rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-ink-faint sm:inline">
            Mezo buildathon
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex shrink-0 items-center gap-4 text-sm sm:gap-6"
        >
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`transition-colors ${
              pathname === "/"
                ? "font-medium text-ink"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            Overview
          </Link>
          <Link
            href="/lab"
            aria-current={inLab ? "page" : undefined}
            className={`rounded-sm px-3.5 py-1.5 font-medium transition-colors ${
              inLab
                ? "bg-ink-soft text-background"
                : "bg-ink text-background hover:bg-ink-soft"
            }`}
          >
            Risk lab
          </Link>
        </nav>
      </div>
    </header>
  );
}
