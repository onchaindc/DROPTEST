"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/lab", label: "Stress Lab" },
  { href: "/studio", label: "Scenario Studio" },
  { href: "/method", label: "Research & Methodology" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="tabular flex h-7 w-7 items-center justify-center rounded-sm bg-ink text-[13px] font-bold text-background">
            _/
          </span>
          <span className="text-sm font-semibold tracking-tight">DROPTEST</span>
          <span className="hidden rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-ink-faint sm:inline">
            Mezo buildathon
          </span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`transition-colors ${
                  active
                    ? "font-medium text-ink underline decoration-accent decoration-2 underline-offset-8"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
