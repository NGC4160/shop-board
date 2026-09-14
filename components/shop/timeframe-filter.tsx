"use client";

import { X } from "lucide-react";
import { formatTimeframe, isIsoDate } from "@/lib/jobs";

type TimeframeFilterProps = {
  value: string;
  onChange: (isoDate: string) => void;
};

function openNativePicker(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    input.focus();
  }
}

export function TimeframeFilter({ value, onChange }: TimeframeFilterProps) {
  const iso = isIsoDate(value) ? value : "";
  const readable = formatTimeframe(iso);

  return (
    <div
      className="timeframe-filter flex min-w-0 shrink-0 items-center gap-1.5"
      data-testid="timeframe-filter"
    >
      <label
        className="max-sm:sr-only shrink-0 text-xs font-semibold tracking-wide text-muted uppercase"
        htmlFor="timeframe-filter-date"
      >
        Timeframe
      </label>
      <input
        id="timeframe-filter-date"
        type="date"
        aria-label="Filter board by Date started"
        title={readable || "Choose a date to show jobs started that day"}
        value={iso}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => openNativePicker(event.currentTarget)}
        className="board-date h-8 min-w-0 w-[10.5rem] rounded-sm border border-border bg-background px-2 text-sm text-foreground"
      />
      {iso ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-border text-subtle hover:bg-surface-3 hover:text-foreground"
          title="Clear timeframe filter"
          data-testid="timeframe-filter-clear"
        >
          <X className="size-3.5" />
          <span className="sr-only">Clear timeframe filter</span>
        </button>
      ) : null}
    </div>
  );
}
