"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  PART_CARRIERS,
  PART_STATUS_CHIP,
  PART_STATUSES,
  trackingUrl,
  type PartLine,
} from "@/lib/parts";
import { formatTimeframe, isIsoDate } from "@/lib/jobs";
import { cn } from "@/lib/utils";

type PartsTableProps = {
  parts: PartLine[];
  onChange: (id: string, patch: Partial<PartLine>) => boolean;
  onRemove: (part: PartLine) => void;
};

export function PartsTable({ parts, onChange, onRemove }: PartsTableProps) {
  return (
    <table className="parts-sheet text-left">
      <colgroup>
        <col className="parts-col-index" />
        <col className="parts-col-customer" />
        <col className="parts-col-job" />
        <col className="parts-col-part" />
        <col className="parts-col-vendor" />
        <col className="parts-col-status" />
        <col className="parts-col-tracking" />
        <col className="parts-col-date" />
        <col className="parts-col-note" />
      </colgroup>
      <thead className="text-sm">
        <tr>
          <th scope="col" className="board-sticky-index-head border-b border-r border-border px-0 py-1">
            <span className="inline-flex h-9 w-full items-center justify-center text-xs font-semibold tracking-wide text-muted">
              #
            </span>
          </th>
          <th className="board-sticky-head border-b border-r border-border px-1 py-1">
            <ColumnLabel>Customer</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-r border-border px-1 py-1">
            <ColumnLabel>Job number</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-r border-border px-1 py-1">
            <ColumnLabel>Part</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Vendor</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Status</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Tracking</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Expected</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Note</ColumnLabel>
          </th>
        </tr>
      </thead>
      <tbody>
        {parts.map((part, index) => {
          const rowNumber = index + 1;
          return (
            <tr key={part.id} className="align-top" data-part-id={part.id} data-board-row={rowNumber}>
              <td className="board-sticky-index border-r border-b border-border px-0 py-1">
                <span className="board-row-index" aria-label={`Parts row ${rowNumber}`}>
                  {rowNumber}
                </span>
              </td>
              <td className="border-r border-b border-border px-1 py-1">
                <div className="flex min-w-0 items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <TextField
                      label="Customer"
                      value={part.customerName}
                      placeholder="Customer"
                      className="font-semibold"
                      onCommit={(customerName) => onChange(part.id, { customerName })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(part)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-subtle hover:bg-surface-3 hover:text-danger"
                    title="Remove from parts board"
                    aria-label={`Remove ${part.customerName || "part"} from the parts board`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </td>
              <td className="border-r border-b border-border px-1 py-1">
                <TextField
                  label="Job number"
                  value={part.jobNumber}
                  placeholder="Job #"
                  className="font-mono"
                  onCommit={(jobNumber) => onChange(part.id, { jobNumber })}
                />
              </td>
              <td className="border-r border-b border-border px-1 py-1">
                <TextField
                  label="Part description"
                  value={part.partDescription}
                  placeholder="Part"
                  onCommit={(partDescription) => onChange(part.id, { partDescription })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <TextField
                  label="Vendor"
                  value={part.vendor}
                  placeholder="Vendor"
                  onCommit={(vendor) => onChange(part.id, { vendor })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <select
                  aria-label="Status"
                  value={part.status}
                  onChange={(event) => onChange(part.id, { status: event.target.value as PartLine["status"] })}
                  className={cn(
                    "board-select h-11 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 text-base font-semibold",
                    PART_STATUS_CHIP[part.status],
                  )}
                >
                  {PART_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border-b border-border px-1 py-1">
                <TrackingField part={part} onChange={onChange} />
              </td>
              <td className="border-b border-border px-1 py-1">
                <ExpectedDateField part={part} onChange={onChange} />
              </td>
              <td className="border-b border-border px-1 py-1">
                <TextField
                  label="Note"
                  value={part.note}
                  placeholder="Note"
                  onCommit={(note) => onChange(part.id, { note })}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ColumnLabel({ children }: { children: string }) {
  return (
    <span className="inline-flex h-9 items-center px-2 text-xs font-semibold tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

function TextField({
  label,
  value,
  placeholder,
  className,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  const commit = (raw: string) => {
    const next = raw.replace(/\s+/g, " ").trim();
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-base text-foreground",
        className,
      )}
    />
  );
}

function TrackingField({
  part,
  onChange,
}: {
  part: PartLine;
  onChange: (id: string, patch: Partial<PartLine>) => boolean;
}) {
  const href = trackingUrl(part.carrier, part.trackingNumber);

  return (
    <div className="grid min-w-0 gap-1">
      <select
        aria-label="Carrier"
        value={part.carrier}
        onChange={(event) => onChange(part.id, { carrier: event.target.value as PartLine["carrier"] })}
        className="board-select h-11 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 text-base text-foreground"
      >
        <option value="">Carrier</option>
        {PART_CARRIERS.map((carrier) => (
          <option key={carrier} value={carrier}>
            {carrier}
          </option>
        ))}
      </select>
      <TextField
        label="Tracking number"
        value={part.trackingNumber}
        placeholder="Tracking #"
        className="font-mono"
        onCommit={(trackingNumber) => onChange(part.id, { trackingNumber })}
      />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="truncate px-1 text-sm font-semibold text-accent underline-offset-2 hover:underline"
        >
          Track {part.carrier || "package"}
        </a>
      ) : null}
    </div>
  );
}

function ExpectedDateField({
  part,
  onChange,
}: {
  part: PartLine;
  onChange: (id: string, patch: Partial<PartLine>) => boolean;
}) {
  const iso = isIsoDate(part.expectedDate) ? part.expectedDate : "";
  const readable = formatTimeframe(iso);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        type="date"
        aria-label="Expected date"
        title={readable || "Expected date"}
        value={iso}
        onChange={(event) => onChange(part.id, { expectedDate: event.target.value })}
        className="board-date h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2 text-base md:text-sm"
      />
      {iso ? (
        <button
          type="button"
          onClick={() => onChange(part.id, { expectedDate: "" })}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
          title="Clear expected date"
        >
          <X className="size-4" />
          <span className="sr-only">Clear expected date</span>
        </button>
      ) : null}
    </div>
  );
}
