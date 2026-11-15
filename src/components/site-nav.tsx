"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/lab", label: "Stress Lab" },
  { href: "/studio", label: "Scenario Studio" },
  { href: "/method", label: "Methodology" },
];

export function SiteNav() {
  const pathname = usePathname();
  const inLab = pathname === "/lab" || pathname === "/report";

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="DROPTEST home">
          <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-[13px] font-bold text-white">
            _/
          </span>
          <span className="text-[15px] font-semibold tracking-tight">DROPTEST</span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => {
            const active =
              pathname === link.href ||
              (link.href === "/lab" && pathname === "/report");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                    : "text-ink-soft hover:bg-surface hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href={inLab ? "/studio" : "/lab"}
          className={`btn px-3.5 py-2 text-[13px] ${
            inLab ? "btn-secondary" : "btn-primary"
          }`}
        >
          {inLab ? "Compare paths" : "Open the lab"}
        </Link>
      </div>
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] ${
              pathname === link.href
                ? "bg-surface font-medium text-ink"
                : "text-ink-soft"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
