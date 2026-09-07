"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  NEXT_ACTION_PRESETS,
  PIPELINE_STATUSES,
  PRIMARY_TECHS,
  TIME_PRESETS,
  createId,
  draftToJob,
  emptyDraft,
  getJobsSnapshot,
  getServerJobsSnapshot,
  isClosedStatus,
  saveJobs,
  statusTone,
  subscribeJobs,
  type CartJob,
  type StatusTone,
} from "@/lib/jobs";
import {
  getServerSortSnapshot,
  getSortSnapshot,
  saveSort,
  setStatusSortMode,
  sortJobsBy,
  subscribeSort,
  toggleSort,
  type SortColumn,
  type SortState,
  type StatusSortMode,
} from "@/lib/sort";

const STATUS_CHIP: Record<StatusTone, string> = {
  new: "bg-wait text-accent-ink",
  dropoff: "bg-wait text-accent-ink",
  pictures: "bg-estimate text-accent-ink",
  ryan: "bg-bay text-accent-ink",
  deposit: "bg-deposit text-accent-ink",
  order: "bg-parts text-accent-ink",
  materials: "bg-parts text-accent-ink",
  scheduled: "bg-wait text-accent-ink",
  callback: "bg-deposit text-accent-ink",
  queue: "bg-queue text-accent-ink",
  estimate: "bg-estimate text-accent-ink",
  progress: "bg-bay text-accent-ink",
  approval: "bg-estimate text-accent-ink",
  qc: "bg-queue text-accent-ink",
  payment: "bg-deposit text-accent-ink",
  pickup: "bg-ready text-accent-ink",
  invoice: "bg-wait text-accent-ink",
  hold: "bg-surface-2 text-muted border border-border",
  done: "bg-surface-2 text-muted border border-border",
  custom: "bg-surface-2 text-foreground border border-border",
};

const OTHER_VALUE = "__other__";
const inputClass =
  "min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";

export function ShopBoard() {
  const jobs = useSyncExternalStore(subscribeJobs, getJobsSnapshot, getServerJobsSnapshot);
  const sort = useSyncExternalStore(subscribeSort, getSortSnapshot, getServerSortSnapshot);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const persist = (next: CartJob[]) => {
    saveJobs(next);
  };

  const visibleJobs = useMemo(() => sortJobsBy(jobs, sort), [jobs, sort]);
  const changeSort = (column: SortColumn) => {
    saveSort(toggleSort(sort, column));
  };
  const changeStatusMode = (mode: StatusSortMode) => {
    saveSort(setStatusSortMode(sort, mode));
  };
  const openCount = visibleJobs.filter((job) => !isClosedStatus(job.status)).length;

  const updateJob = (id: string, patch: Partial<CartJob>) => {
    persist(
      jobs.map((job) =>
        job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job,
      ),
    );
  };

  const addRow = () => {
    persist([
      {
        ...draftToJob(emptyDraft),
        id: createId(),
        customerName: "",
        jobNumber: "",
      },
      ...jobs,
    ]);
  };

  const deleteJob = (id: string) => {
    persist(jobs.filter((job) => job.id !== id));
    setPendingDelete(null);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface px-3 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Covington, LA
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Neighborhood Golf Carts
            </h1>
            <p className="mt-1 text-base text-muted">Shop Board — spreadsheet of carts in the shop</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">
              {openCount} open · {visibleJobs.length} total
            </p>
            <button
              type="button"
              onClick={addRow}
              className="min-h-11 rounded-lg bg-accent px-5 text-base font-bold text-accent-ink"
            >
              Add row
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-2 py-3 sm:px-4">
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th
                  aria-sort={
                    sort.column === "customerName" || sort.column === "jobNumber"
                      ? headerSort(sort, sort.column)
                      : "none"
                  }
                  className="sticky left-0 z-20 min-w-52 border-r border-border bg-surface-2 px-2 py-2 shadow-[6px_0_10px_-6px_rgba(0,0,0,0.65)]"
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <SortHeader
                      column="customerName"
                      label="Customer name"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      column="jobNumber"
                      label="Job number"
                      sort={sort}
                      onSort={changeSort}
                    />
                  </div>
                </th>
                <th aria-sort={headerSort(sort, "primaryTech")} className="px-2 py-2">
                  <SortHeader
                    column="primaryTech"
                    label="Primary tech"
                    sort={sort}
                    onSort={changeSort}
                  />
                </th>
                <th aria-sort={headerSort(sort, "status")} className="px-2 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <SortHeader column="status" label="Status" sort={sort} onSort={changeSort} />
                    <StatusModeToggle sort={sort} onStatusMode={changeStatusMode} />
                  </div>
                </th>
                <th aria-sort={headerSort(sort, "nextAction")} className="px-2 py-2">
                  <SortHeader
                    column="nextAction"
                    label="Next action"
                    sort={sort}
                    onSort={changeSort}
                  />
                </th>
                <th aria-sort={headerSort(sort, "timeExpectation")} className="px-2 py-2">
                  <SortHeader
                    column="timeExpectation"
                    label="Time expectation"
                    sort={sort}
                    onSort={changeSort}
                  />
                </th>
                <th className="px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr key={job.id} className="border-t border-border align-top">
                  <td className="sticky left-0 z-10 border-r border-border bg-surface px-2 py-2 shadow-[6px_0_10px_-6px_rgba(0,0,0,0.65)]">
                    <div className="flex min-w-48 flex-col gap-1">
                      <input
                        aria-label="Customer name"
                        value={job.customerName}
                        onChange={(event) =>
                          updateJob(job.id, { customerName: event.target.value })
                        }
                        placeholder="Customer name"
                        className={`${inputClass} font-semibold`}
                      />
                      <input
                        aria-label="Job number"
                        value={job.jobNumber}
                        onChange={(event) =>
                          updateJob(job.id, { jobNumber: event.target.value })
                        }
                        placeholder="Job #"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <ComboCell
                      value={job.primaryTech}
                      options={PRIMARY_TECHS}
                      emptyLabel="Unassigned"
                      placeholder="Type a tech name"
                      onChange={(primaryTech) => updateJob(job.id, { primaryTech })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <ComboCell
                      value={job.status}
                      options={PIPELINE_STATUSES}
                      placeholder="Type a status"
                      badge={
                        <span
                          className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs font-bold ${STATUS_CHIP[statusTone(job.status)]}`}
                        >
                          {job.status || "—"}
                        </span>
                      }
                      onChange={(status) => updateJob(job.id, { status })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <ComboCell
                      value={job.nextAction}
                      options={NEXT_ACTION_PRESETS}
                      placeholder="What happens next?"
                      onChange={(nextAction) => updateJob(job.id, { nextAction })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <ComboCell
                      value={job.timeExpectation}
                      options={TIME_PRESETS}
                      placeholder="ETA / due / promised"
                      onChange={(timeExpectation) => updateJob(job.id, { timeExpectation })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    {pendingDelete === job.id ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => deleteJob(job.id)}
                          className="min-h-10 rounded-md bg-danger px-3 text-sm font-bold text-accent-ink"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(job.id)}
                        className="min-h-10 rounded-md border border-danger/50 px-3 text-sm font-semibold text-danger"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleJobs.length === 0 ? (
          <p className="mt-4 text-base text-muted">No carts yet. Use Add row to start the board.</p>
        ) : null}
      </main>
    </div>
  );
}

function ComboCell({
  value,
  options,
  onChange,
  emptyLabel,
  placeholder,
  badge,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  placeholder?: string;
  badge?: ReactNode;
}) {
  const known =
    (emptyLabel !== undefined && value === "") || options.includes(value);
  const selectValue = known ? value : OTHER_VALUE;

  return (
    <div className="flex min-w-44 flex-col gap-1">
      {badge}
      <select
        aria-label="Choose a saved option"
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === OTHER_VALUE) return;
          onChange(event.target.value);
        }}
        className={inputClass}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER_VALUE}>Other…</option>
      </select>
      <input
        aria-label="Free text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

function headerSort(sort: SortState, column: SortColumn): "ascending" | "descending" | "none" {
  if (sort.column !== column) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

function sortMarker(sort: SortState, column: SortColumn): string {
  if (sort.column !== column) return "⇅";
  if (column === "status") {
    const mode = sort.statusMode === "alpha" ? "A–Z" : "Pipeline";
    return `${mode} ${sort.direction === "asc" ? "▲" : "▼"}`;
  }
  if (column === "jobNumber") {
    return sort.direction === "asc" ? "1–9 ▲" : "9–1 ▼";
  }
  return sort.direction === "asc" ? "A–Z ▲" : "Z–A ▼";
}

function SortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}) {
  const active = sort.column === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1 rounded px-1 text-left text-sm font-semibold hover:text-foreground ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden className={active ? "text-accent" : "text-muted/70"}>
        {sortMarker(sort, column)}
      </span>
    </button>
  );
}

function StatusModeToggle({
  sort,
  onStatusMode,
}: {
  sort: SortState;
  onStatusMode: (mode: StatusSortMode) => void;
}) {
  const active = sort.column === "status";
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onStatusMode("pipeline")}
        className={`min-h-8 rounded px-2 text-xs font-semibold ${
          active && sort.statusMode === "pipeline"
            ? "bg-accent text-accent-ink"
            : "border border-border text-muted"
        }`}
      >
        Pipeline
      </button>
      <button
        type="button"
        onClick={() => onStatusMode("alpha")}
        className={`min-h-8 rounded px-2 text-xs font-semibold ${
          active && sort.statusMode === "alpha"
            ? "bg-accent text-accent-ink"
            : "border border-border text-muted"
        }`}
      >
        A–Z
      </button>
    </div>
  );
}
