"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
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
  hasDuplicateJobNumber,
  isClosedStatus,
  isValidJobNumber,
  jobNumberError,
  normalizeJobNumber,
  saveJobs,
  timeExpectationError,
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
const HIT = "min-h-11 min-w-11";
const inputClass =
  `${HIT} min-w-0 w-full max-w-full rounded-md border border-border bg-background px-2 text-sm text-foreground`;

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
    if (patch.jobNumber !== undefined) {
      if (!isValidJobNumber(patch.jobNumber)) return;
      if (hasDuplicateJobNumber(jobs, id, patch.jobNumber)) return;
      patch = { ...patch, jobNumber: normalizeJobNumber(patch.jobNumber) };
    }
    if (
      patch.timeExpectation !== undefined &&
      timeExpectationError(patch.timeExpectation)
    ) {
      return;
    }
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
    <div className="flex min-h-full flex-col overflow-x-hidden">
      <header className="border-b border-border bg-surface px-3 py-4">
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
              className={`${HIT} rounded-lg bg-accent px-5 text-base font-bold text-accent-ink`}
            >
              Add row
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-2 py-3">
        <div className="mb-3 flex flex-col gap-2 md:hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sort</p>
          <div className="flex flex-wrap items-center gap-1">
            <SortHeader column="customerName" label="Customer" sort={sort} onSort={changeSort} />
            <SortHeader column="jobNumber" label="Job #" sort={sort} onSort={changeSort} />
            <SortHeader column="primaryTech" label="Tech" sort={sort} onSort={changeSort} />
            <SortHeader column="status" label="Status" sort={sort} onSort={changeSort} />
            <SortHeader column="nextAction" label="Next" sort={sort} onSort={changeSort} />
            <SortHeader column="timeExpectation" label="Time" sort={sort} onSort={changeSort} />
            <StatusModeToggle sort={sort} onStatusMode={changeStatusMode} />
          </div>
        </div>

        <ul className="grid gap-3 md:hidden">
          {visibleJobs.map((job) => (
            <li key={job.id} className="rounded-lg border border-border bg-surface p-2">
              <div className="grid gap-2">
                <FieldLabel>Customer + job</FieldLabel>
                <IdentityFields job={job} jobs={jobs} onChange={updateJob} />
                <FieldLabel>Primary tech</FieldLabel>
                <ComboCell
                  value={job.primaryTech}
                  options={PRIMARY_TECHS}
                  emptyLabel="Unassigned"
                  placeholder="Type a tech name"
                  layout="row"
                  onChange={(primaryTech) => updateJob(job.id, { primaryTech })}
                />
                <FieldLabel>Status</FieldLabel>
                <ComboCell
                  value={job.status}
                  options={PIPELINE_STATUSES}
                  placeholder="Type a status"
                  layout="row"
                  selectClassName={`font-semibold ${STATUS_CHIP[statusTone(job.status)]}`}
                  onChange={(status) => updateJob(job.id, { status })}
                />
                <FieldLabel>Next action</FieldLabel>
                <ComboCell
                  value={job.nextAction}
                  options={NEXT_ACTION_PRESETS}
                  placeholder="What happens next?"
                  layout="row"
                  onChange={(nextAction) => updateJob(job.id, { nextAction })}
                />
                <FieldLabel>Time expectation</FieldLabel>
                <ComboCell
                  value={job.timeExpectation}
                  options={TIME_PRESETS}
                  placeholder="ETA / due / promised"
                  layout="row"
                  errorFor={timeExpectationError}
                  onChange={(timeExpectation) => updateJob(job.id, { timeExpectation })}
                />
                <DeleteControl
                  pending={pendingDelete === job.id}
                  onAsk={() => setPendingDelete(job.id)}
                  onConfirm={() => deleteJob(job.id)}
                  onKeep={() => setPendingDelete(null)}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-visible rounded-lg border border-border bg-surface md:block">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th
                  aria-sort={
                    sort.column === "customerName" || sort.column === "jobNumber"
                      ? headerSort(sort, sort.column)
                      : "none"
                  }
                  className="sticky left-0 z-20 border-r border-border bg-surface-2 px-1 py-1"
                >
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <SortHeader
                      column="customerName"
                      label="Customer"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortHeader
                      column="jobNumber"
                      label="Job #"
                      sort={sort}
                      onSort={changeSort}
                    />
                  </div>
                </th>
                <th aria-sort={headerSort(sort, "primaryTech")} className="px-1 py-1">
                  <SortHeader
                    column="primaryTech"
                    label="Tech"
                    sort={sort}
                    onSort={changeSort}
                  />
                </th>
                <th aria-sort={headerSort(sort, "status")} className="px-1 py-1">
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <SortHeader column="status" label="Status" sort={sort} onSort={changeSort} />
                    <StatusModeToggle sort={sort} onStatusMode={changeStatusMode} />
                  </div>
                </th>
                <th aria-sort={headerSort(sort, "nextAction")} className="px-1 py-1">
                  <SortHeader
                    column="nextAction"
                    label="Next"
                    sort={sort}
                    onSort={changeSort}
                  />
                </th>
                <th aria-sort={headerSort(sort, "timeExpectation")} className="px-1 py-1">
                  <SortHeader
                    column="timeExpectation"
                    label="Time"
                    sort={sort}
                    onSort={changeSort}
                  />
                </th>
                <th className="sticky right-0 z-20 bg-surface-2 px-1 py-1">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr key={job.id} className="border-t border-border align-top">
                  <td className="sticky left-0 z-10 border-r border-border bg-surface px-1 py-1">
                    <IdentityFields job={job} jobs={jobs} onChange={updateJob} />
                  </td>
                  <td className="overflow-visible px-1 py-1">
                    <ComboCell
                      value={job.primaryTech}
                      options={PRIMARY_TECHS}
                      emptyLabel="Unassigned"
                      placeholder="Tech name"
                      onChange={(primaryTech) => updateJob(job.id, { primaryTech })}
                    />
                  </td>
                  <td className="overflow-visible px-1 py-1">
                    <ComboCell
                      value={job.status}
                      options={PIPELINE_STATUSES}
                      placeholder="Status"
                      selectClassName={`font-semibold ${STATUS_CHIP[statusTone(job.status)]}`}
                      onChange={(status) => updateJob(job.id, { status })}
                    />
                  </td>
                  <td className="overflow-visible px-1 py-1">
                    <ComboCell
                      value={job.nextAction}
                      options={NEXT_ACTION_PRESETS}
                      placeholder="Next"
                      onChange={(nextAction) => updateJob(job.id, { nextAction })}
                    />
                  </td>
                  <td className="overflow-visible px-1 py-1">
                    <ComboCell
                      value={job.timeExpectation}
                      options={TIME_PRESETS}
                      placeholder="Time"
                      errorFor={timeExpectationError}
                      onChange={(timeExpectation) => updateJob(job.id, { timeExpectation })}
                    />
                  </td>
                  <td className="sticky right-0 z-10 bg-surface px-1 py-1">
                    <DeleteControl
                      pending={pendingDelete === job.id}
                      onAsk={() => setPendingDelete(job.id)}
                      onConfirm={() => deleteJob(job.id)}
                      onKeep={() => setPendingDelete(null)}
                    />
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

function FieldLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</p>;
}

function IdentityFields({
  job,
  jobs,
  onChange,
}: {
  job: CartJob;
  jobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => void;
}) {
  const [nameDraft, setNameDraft] = useState(job.customerName);
  const [jobDraft, setJobDraft] = useState(job.jobNumber);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    setNameDraft(job.customerName);
  }, [job.customerName]);

  useEffect(() => {
    setJobDraft(job.jobNumber);
  }, [job.jobNumber]);

  const changeJobNumber = (next: string) => {
    setJobDraft(next);
    const formatError = jobNumberError(next);
    if (formatError) {
      setWarning(formatError);
      return;
    }
    if (hasDuplicateJobNumber(jobs, job.id, next)) {
      setWarning(`Job # ${normalizeJobNumber(next)} is already on the board`);
      return;
    }
    setWarning("");
    onChange(job.id, { jobNumber: next });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        aria-label="Customer name"
        value={nameDraft}
        onChange={(event) => {
          setNameDraft(event.target.value);
          onChange(job.id, { customerName: event.target.value });
        }}
        onBlur={() => {
          const trimmed = nameDraft.trim();
          setNameDraft(trimmed);
          if (trimmed !== job.customerName) {
            onChange(job.id, { customerName: trimmed });
          }
        }}
        placeholder="Customer name"
        className={`${inputClass} font-semibold`}
      />
      <input
        aria-label="Job number"
        inputMode="numeric"
        value={jobDraft}
        onChange={(event) => changeJobNumber(event.target.value)}
        onBlur={() => {
          if (warning) setJobDraft(job.jobNumber);
        }}
        aria-invalid={Boolean(warning)}
        placeholder="1851 or 17312-1"
        className={`${inputClass} font-mono ${warning ? "border-danger" : ""}`}
      />
      {warning ? <p className="text-xs font-semibold text-danger">{warning}</p> : null}
    </div>
  );
}

function DeleteControl({
  pending,
  onAsk,
  onConfirm,
  onKeep,
}: {
  pending: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  if (pending) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          onClick={onConfirm}
          className={`${HIT} rounded-md bg-danger px-3 text-sm font-bold text-accent-ink`}
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={onKeep}
          className={`${HIT} rounded-md border border-border px-3 text-sm font-semibold`}
        >
          Keep
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAsk}
      className={`${HIT} rounded-md border border-danger/50 px-3 text-sm font-semibold text-danger`}
    >
      Delete
    </button>
  );
}

function ComboCell({
  value,
  options,
  onChange,
  emptyLabel,
  placeholder,
  selectClassName,
  layout = "stack",
  errorFor,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  placeholder?: string;
  selectClassName?: string;
  layout?: "stack" | "row";
  errorFor?: (next: string) => string | null;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pickedOther, setPickedOther] = useState(false);
  const [textDraft, setTextDraft] = useState(value);
  const [warning, setWarning] = useState("");
  const menuOptions = [
    ...(emptyLabel !== undefined ? [{ value: "", label: emptyLabel }] : []),
    ...options.map((option) => ({ value: option, label: option })),
    { value: OTHER_VALUE, label: "Other…" },
  ];
  const isKnown = value === "" || options.includes(value);
  const showText = !isKnown || pickedOther;
  const currentIndex = showText
    ? menuOptions.findIndex((option) => option.value === OTHER_VALUE)
    : Math.max(
        0,
        menuOptions.findIndex((option) => option.value === value),
      );
  const [highlight, setHighlight] = useState(currentIndex);

  const closeWithoutCommit = () => {
    setOpen(false);
    setHighlight(currentIndex);
  };

  const commit = (next: string) => {
    setOpen(false);
    if (next === OTHER_VALUE) {
      setPickedOther(true);
      setTextDraft("");
      setWarning("");
      queueMicrotask(() => textRef.current?.focus());
      return;
    }
    setPickedOther(false);
    setWarning("");
    setTextDraft(next);
    onChange(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeWithoutCommit();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWithoutCommit();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setHighlight(currentIndex);
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index) => (index + delta + menuOptions.length) % menuOptions.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setHighlight(currentIndex);
        setOpen(true);
        return;
      }
      commit(menuOptions[highlight]?.value ?? value);
    }
  };

  const display = showText
    ? "Other…"
    : emptyLabel !== undefined && value === ""
      ? emptyLabel
      : value;

  return (
    <div
      ref={rootRef}
      className={
        layout === "row" && showText
          ? "grid min-w-0 grid-cols-2 gap-1"
          : "flex min-w-0 w-full flex-col gap-1"
      }
    >
      <div className="relative min-w-0">
        <button
          type="button"
          aria-label="Choose a saved option"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          role="combobox"
          onClick={() => {
            if (open) {
              closeWithoutCommit();
              return;
            }
            setHighlight(currentIndex);
            setOpen(true);
          }}
          onKeyDown={onTriggerKeyDown}
          className={`${inputClass} truncate text-left ${selectClassName ?? ""}`}
        >
          {display}
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeWithoutCommit();
              }
            }}
            className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-2xl"
          >
            {menuOptions.map((option, index) => (
              <li key={`${option.label}-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => commit(option.value)}
                  className={`flex w-full items-center truncate px-2 text-left text-sm ${
                    index === highlight ? "bg-accent text-accent-ink" : "hover:bg-surface-2"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {showText ? (
        <input
          ref={textRef}
          aria-label="Free text"
          value={isKnown && pickedOther ? textDraft || "" : warning ? textDraft : value}
          onChange={(event) => {
            const next = event.target.value;
            setPickedOther(true);
            setTextDraft(next);
            const error = errorFor?.(next) ?? null;
            if (error) {
              setWarning(error);
              return;
            }
            setWarning("");
            onChange(next);
          }}
          placeholder={placeholder}
          aria-invalid={Boolean(warning)}
          className={`${inputClass} ${warning ? "border-danger" : ""}`}
        />
      ) : null}
      {warning ? <p className="text-xs font-semibold text-danger">{warning}</p> : null}
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
      className={`inline-flex ${HIT} max-w-full items-center gap-1 rounded px-2 text-left text-sm font-semibold hover:text-foreground ${
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
        className={`${HIT} rounded px-3 text-sm font-semibold ${
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
        className={`${HIT} rounded px-3 text-sm font-semibold ${
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
