"use client";

import type { CartJob } from "@/lib/jobs";

export function RemoveConfirm({
  job,
  onKeep,
  onRemove,
}: {
  job: CartJob;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const label = [job.customerName.trim(), job.jobNumber.trim() ? `#${job.jobNumber}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={onKeep}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-job-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface-2 p-5 shadow-[var(--shadow-lift)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="remove-job-title" className="font-display text-2xl font-semibold">
          Remove from the board?
        </h2>
        <p className="mt-2 text-base text-muted">
          {label || "This row"} leaves this tablet’s board only. The Housecall Pro job is not
          deleted.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="inline-flex h-12 items-center justify-center rounded-sm border border-border text-base font-medium"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-12 items-center justify-center rounded-sm bg-danger text-base font-semibold text-danger-fg"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
