"use client";

import Link from "next/link";
import {
  PIPELINE_STATUSES,
  STATUS_CHIP,
  cartLabel,
  isClosedStatus,
  statusTone,
  type CartJob,
} from "@/lib/jobs";
import { CartMark } from "@/components/shop/cart-mark";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sortJobsByJobNumber } from "@/lib/sort";
import { useEffect, useMemo, useState } from "react";

const WALL_STATUSES = PIPELINE_STATUSES.filter(
  (status) => status !== "Completed" && status !== "Invoice Paid",
);

export function WallBoard({ jobs }: { jobs: CartJob[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const openJobs = useMemo(
    () => jobs.filter((job) => !isClosedStatus(job.status)),
    [jobs],
  );

  const groups = WALL_STATUSES.map((status) => ({
    status,
    jobs: sortJobsByJobNumber(openJobs.filter((job) => job.status === status)),
  })).filter((group) => group.jobs.length > 0);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-end justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <CartMark className="size-10 text-accent" />
          <div>
            <p className="font-display text-xs font-semibold tracking-[0.22em] text-accent uppercase">
              Neighborhood Golf Carts · Covington
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Shop Board</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight">
            {formatClock(now)}
          </p>
          <p className="text-sm text-muted">
            {openJobs.length} open carts ·{" "}
            <Link href="/" className="text-accent underline-offset-2 hover:underline">
              Floor view
            </Link>
          </p>
        </div>
      </header>
      <main className="flex-1 p-5">
        {groups.length === 0 ? (
          <p className="text-xl text-muted">No open carts on the board.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <section key={group.status} className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2
                    className={cn(
                      "inline-flex h-8 items-center rounded-sm px-2.5 font-display text-lg font-semibold tracking-tight",
                      STATUS_CHIP[statusTone(group.status)],
                    )}
                  >
                    {group.status}
                  </h2>
                  <p className="font-mono text-sm text-muted tabular-nums">{group.jobs.length}</p>
                </div>
                <ul className="space-y-2">
                  {group.jobs.map((job) => (
                    <li
                      key={job.id}
                      className={cn(
                        "rounded-md bg-surface-2 px-3 py-3",
                        job.priority === "hot" &&
                          "shadow-[inset_3px_0_0_0_var(--color-flag-hot)]",
                        job.priority === "promised" &&
                          "shadow-[inset_3px_0_0_0_var(--color-flag-promised)]",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-display text-2xl font-semibold tracking-tight">
                          {job.customerName || "Untitled"}
                        </p>
                        <p className="shrink-0 font-mono text-sm text-muted">
                          #{job.jobNumber || "—"}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">
                        {cartLabel(job) || "Cart TBD"} · {job.primaryTech || "Unassigned"}
                        {job.bay ? ` · ${job.bay}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {job.nextAction || "No next action"}
                        {job.timeExpectation ? ` · ${job.timeExpectation}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
