"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Jobs", current: "jobs" },
  { href: "/parts", label: "Parts", current: "parts" },
] as const;

export function BoardNav({ current }: { current: "jobs" | "parts" }) {
  return (
    <nav aria-label="Shop boards" className="flex shrink-0 items-center gap-1">
      {LINKS.map((link) => {
        const active = link.current === current;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-sm px-2.5 text-sm font-semibold",
              active
                ? "border border-accent/50 bg-surface-3 text-accent"
                : "border border-transparent text-muted hover:border-border hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
