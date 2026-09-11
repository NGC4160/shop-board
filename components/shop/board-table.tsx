"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  PIPELINE_STATUSES,
  PRIMARY_TECHS,
  STATUS_CHIP,
  customerNameError,
  formatTimeframe,
  isIsoDate,
  jobNumberWarning,
  normalizeJobNumber,
  statusTone,
  type CartJob,
} from "@/lib/jobs";
import { ComboCell } from "@/components/shop/combo-cell";
import { cn } from "@/lib/utils";

function focusStayedInRow(row: EventTarget | null, next: EventTarget | null) {
  if (!(row instanceof Element) || !(next instanceof Node)) return false;
  if (row.contains(next)) return true;
  return next instanceof Element && Boolean(next.closest('[role="listbox"]'));
}

type BoardTableProps = {
  jobs: CartJob[];
  allJobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  onRemove: (job: CartJob) => void;
  focusId?: string | null;
};

export function BoardTable({ jobs, allJobs, onChange, onRemove, focusId }: BoardTableProps) {
  return (
    <table className="board-sheet text-left">
      <colgroup>
        <col className="board-col-index" />
        <col className="board-col-job" />
        <col className="board-col-customer" />
        <col className="board-col-tech" />
        <col className="board-col-status" />
        <col className="board-col-next" />
        <col className="board-col-timeframe" />
      </colgroup>
      <thead className="text-sm">
        <tr>
          <th
            scope="col"
            className="board-sticky-index-head border-b border-r border-border px-0 py-1"
          >
            <span className="inline-flex h-9 w-full items-center justify-center text-xs font-semibold tracking-wide text-muted">
              #
            </span>
          </th>
          <th className="board-sticky-job-head border-b border-r border-border px-1 py-1">
            <ColumnLabel>Job number</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Customer name</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Primary tech</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Current Status</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Next step</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Timeframe</ColumnLabel>
          </th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job, index) => {
          const rowNumber = index + 1;
          return (
            <tr
              key={job.id}
              className="align-top"
              data-board-row={rowNumber}
              data-job-number={job.jobNumber}
            >
              <td className="board-sticky-index border-r border-b border-border px-0 py-1">
                <span
                  className="board-row-index"
                  aria-label={`Board row ${rowNumber}`}
                >
                  {rowNumber}
                </span>
              </td>
              <td className="board-sticky-job border-r border-b border-border px-1 py-1">
                <JobNumberField job={job} jobs={allJobs} onChange={onChange} />
              </td>
              <td className="border-b border-border px-1 py-1">
                <div className="flex min-w-0 items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <CustomerNameField
                      job={job}
                      onChange={onChange}
                      autoFocus={focusId === job.id}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(job)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-subtle hover:bg-surface-3 hover:text-danger"
                    title="Remove from board"
                    aria-label={`Remove ${job.customerName || "job"} from the board`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </td>
              <td className="border-b border-border px-1 py-1">
                <ComboCell
                  value={job.primaryTech}
                  options={PRIMARY_TECHS}
                  emptyLabel="Unassigned"
                  placeholder="Tech"
                  aria-label="Primary tech"
                  onChange={(primaryTech) => onChange(job.id, { primaryTech })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <ComboCell
                  value={job.status}
                  options={PIPELINE_STATUSES}
                  placeholder="Status"
                  aria-label="Current Status"
                  selectClassName={cn("font-semibold", STATUS_CHIP[statusTone(job.status)])}
                  onChange={(status) => onChange(job.id, { status })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <NextStepField job={job} onChange={onChange} />
              </td>
              <td className="border-b border-border px-1 py-1">
                <TimeframeField job={job} onChange={onChange} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DraftComposer({
  job,
  jobs,
  onChange,
  onCancel,
}: {
  job: CartJob;
  jobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  onCancel: () => void;
}) {
  return (
    <div
      data-draft-composer
      className="border-b border-accent/40 bg-surface-2 px-2 py-2 sm:px-3"
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="px-1 text-[10px] font-semibold tracking-wide text-muted uppercase sm:text-xs">
            New cart · not on the floor until name and job #
          </p>
          <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <CustomerNameField job={job} onChange={onChange} autoFocus ephemeral />
            <JobNumberField job={job} jobs={jobs} onChange={onChange} ephemeral />
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
          title="Cancel new cart"
        >
          <X className="size-4" />
          <span className="sr-only">Cancel new cart</span>
        </button>
      </div>
    </div>
  );
}

function NextStepField({
  job,
  onChange,
}: {
  job: CartJob;
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
}) {
  const [draft, setDraft] = useState(job.nextAction);
  const [seen, setSeen] = useState(job.nextAction);

  if (job.nextAction !== seen) {
    setSeen(job.nextAction);
    setDraft(job.nextAction);
  }

  const commit = (raw: string) => {
    const next = raw.trim();
    setDraft(next);
    if (next !== job.nextAction) onChange(job.id, { nextAction: next });
  };

  return (
    <input
      aria-label="Next step"
      value={draft}
      placeholder="Next step"
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
      }}
      className="h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-base text-foreground"
    />
  );
}

function TimeframeField({
  job,
  onChange,
}: {
  job: CartJob;
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
}) {
  const iso = isIsoDate(job.timeExpectation) ? job.timeExpectation : "";
  const readable = formatTimeframe(iso);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        type="date"
        aria-label="Timeframe"
        title={readable || "Choose a date"}
        value={iso}
        onChange={(event) => {
          onChange(job.id, { timeExpectation: event.target.value });
        }}
        className="board-date h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2 text-base md:text-sm"
      />
      {iso ? (
        <button
          type="button"
          onClick={() => onChange(job.id, { timeExpectation: "" })}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
          title="Clear timeframe"
        >
          <X className="size-4" />
          <span className="sr-only">Clear timeframe</span>
        </button>
      ) : null}
    </div>
  );
}

function ColumnLabel({ children }: { children: string }) {
  return (
    <span className="inline-flex h-9 items-center px-2 text-xs font-semibold tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

function leavingBlankDraft(
  ephemeral: boolean,
  name: string,
  jobNumber: string,
  next: EventTarget | null,
  current: EventTarget | null,
) {
  if (!ephemeral) return false;
  const host =
    current instanceof Element ? current.closest("[data-draft-composer], tr") : null;
  if (focusStayedInRow(host, next)) return false;
  return !name.trim() && !jobNumber.trim();
}

function CustomerNameField({
  job,
  onChange,
  autoFocus = false,
  ephemeral = false,
}: {
  job: CartJob;
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  autoFocus?: boolean;
  ephemeral?: boolean;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState(job.customerName);
  const [seenName, setSeenName] = useState(job.customerName);
  const [nameWarning, setNameWarning] = useState(
    job.customerName.trim() ? customerNameError(job.customerName) ?? "" : "",
  );

  if (job.customerName !== seenName) {
    setSeenName(job.customerName);
    setNameDraft(job.customerName);
    setNameWarning(job.customerName.trim() ? customerNameError(job.customerName) ?? "" : "");
  }

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, [autoFocus]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    const error = customerNameError(trimmed);
    if (error) {
      setNameWarning(error);
      setNameDraft(trimmed);
      return;
    }
    setNameWarning("");
    setNameDraft(trimmed);
    if (trimmed !== job.customerName) onChange(job.id, { customerName: trimmed });
  };

  return (
    <div className="min-w-0">
      <input
        ref={nameRef}
        aria-label="Customer name"
        value={nameDraft}
        onChange={(event) => {
          setNameDraft(event.target.value);
          if (event.target.value.trim()) setNameWarning("");
          if (ephemeral && !customerNameError(event.target.value)) {
            onChange(job.id, { customerName: event.target.value });
          }
        }}
        onBlur={(event) => {
          if (
            leavingBlankDraft(
              ephemeral,
              nameDraft,
              job.jobNumber,
              event.relatedTarget,
              event.currentTarget,
            )
          ) {
            return;
          }
          commitName();
        }}
        aria-invalid={Boolean(nameWarning)}
        placeholder="Customer name"
        className={cn(
          "h-11 min-w-0 w-full rounded-sm border bg-background px-2.5 text-base font-semibold md:text-sm",
          nameWarning ? "border-danger" : "border-border",
        )}
      />
      {nameWarning ? <p className="mt-1 text-xs font-semibold text-danger">{nameWarning}</p> : null}
    </div>
  );
}

function JobNumberField({
  job,
  jobs,
  onChange,
  ephemeral = false,
}: {
  job: CartJob;
  jobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  ephemeral?: boolean;
}) {
  const [jobDraft, setJobDraft] = useState(job.jobNumber);
  const [seenJob, setSeenJob] = useState(job.jobNumber);
  const [jobWarning, setJobWarning] = useState(
    job.jobNumber.trim() ? jobNumberWarning(job.jobNumber, jobs, job.id) : "",
  );

  if (job.jobNumber !== seenJob) {
    setSeenJob(job.jobNumber);
    setJobDraft(job.jobNumber);
    setJobWarning(job.jobNumber.trim() ? jobNumberWarning(job.jobNumber, jobs, job.id) : "");
  }

  const commitJobNumber = () => {
    const warning = jobNumberWarning(jobDraft, jobs, job.id);
    if (warning) {
      setJobWarning(warning);
      return;
    }
    setJobWarning("");
    const normalized = normalizeJobNumber(jobDraft);
    setJobDraft(normalized);
    if (normalized !== job.jobNumber) onChange(job.id, { jobNumber: normalized });
  };

  return (
    <div className="min-w-0">
      <input
        aria-label="Job number"
        inputMode="numeric"
        value={jobDraft}
        onChange={(event) => {
          const next = event.target.value;
          setJobDraft(next);
          setJobWarning(next.trim() ? jobNumberWarning(next, jobs, job.id) : "");
          if (ephemeral && next.trim() && !jobNumberWarning(next, jobs, job.id)) {
            onChange(job.id, { jobNumber: next });
          }
        }}
        onBlur={(event) => {
          if (
            leavingBlankDraft(
              ephemeral,
              job.customerName,
              jobDraft,
              event.relatedTarget,
              event.currentTarget,
            )
          ) {
            return;
          }
          commitJobNumber();
        }}
        aria-invalid={Boolean(jobWarning)}
        placeholder="173128"
        className={cn(
          "h-11 min-w-0 w-full rounded-sm border bg-background px-2.5 font-mono text-base md:text-sm",
          jobWarning ? "border-danger" : "border-border",
        )}
      />
      {jobWarning ? <p className="mt-1 text-xs font-semibold text-danger">{jobWarning}</p> : null}
    </div>
  );
}
