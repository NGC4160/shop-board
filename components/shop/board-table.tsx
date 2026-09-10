"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Flag, PanelRight, Trash2, X } from "lucide-react";
import {
  BAYS,
  CART_COLORS,
  CART_MAKES,
  NEXT_ACTION_PRESETS,
  PIPELINE_STATUSES,
  PRIMARY_TECHS,
  PRIORITY_LABEL,
  STATUS_CHIP,
  TIME_PRESETS,
  customerNameError,
  daysInStatus,
  isBlankIdentity,
  isStale,
  jobNumberWarning,
  nextPipelineStatus,
  nextPriority,
  normalizeJobNumber,
  statusTone,
  timeExpectationError,
  type CartJob,
  type Priority,
} from "@/lib/jobs";
import { ComboCell } from "@/components/shop/combo-cell";
import { agingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isDueToday } from "@/lib/sort";

function focusStayedInRow(row: EventTarget | null, next: EventTarget | null) {
  if (!(row instanceof Element) || !(next instanceof Node)) return false;
  if (row.contains(next)) return true;
  return next instanceof Element && Boolean(next.closest('[role="listbox"]'));
}

type BoardTableProps = {
  jobs: CartJob[];
  allJobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  onAdvance: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  focusId?: string | null;
};

export function BoardTable({
  jobs,
  allJobs,
  onChange,
  onAdvance,
  onDelete,
  onOpen,
  focusId,
}: BoardTableProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <table className="board-sheet text-left">
      <colgroup>
        <col className="board-col-id" />
        <col className="board-col-cart" />
        <col className="board-col-bay" />
        <col className="board-col-tech" />
        <col className="board-col-status" />
        <col className="board-col-next" />
        <col className="board-col-time" />
        <col className="board-col-actions" />
      </colgroup>
      <thead className="text-sm">
        <tr>
          <th className="board-sticky-id-head border-b border-r border-border px-1 py-1">
            <div className="flex min-w-0 flex-col items-start gap-0.5 px-2 py-1">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                Customer
              </span>
              <span className="text-xs font-semibold tracking-wide text-foreground uppercase">
                Job #
              </span>
            </div>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Cart</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Bay</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Tech</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Status</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Next</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Time</ColumnLabel>
          </th>
          <th className="board-sticky-actions-head border-b border-border px-1 py-1">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {jobs
          .filter((job) => !isBlankIdentity(job))
          .map((job) => {
          const next = nextPipelineStatus(job.status);
          const due = isDueToday(job);
          const stale = isStale(job);
          const confirming = pendingDelete === job.id;
          return (
            <tr key={job.id} className="align-top">
              <td
                className={cn(
                  "board-sticky-id z-10 border-r border-b border-border px-1 py-1",
                  flagBar(job.priority),
                )}
              >
                <IdentityFields
                  job={job}
                  jobs={allJobs}
                  onChange={onChange}
                  autoFocus={focusId === job.id}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <CartFields job={job} onChange={onChange} />
              </td>
              <td className="border-b border-border px-1 py-1">
                <ComboCell
                  value={job.bay}
                  options={BAYS}
                  emptyLabel="—"
                  placeholder="Bay"
                  aria-label="Bay"
                  onChange={(bay) => onChange(job.id, { bay })}
                />
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
                  aria-label="Status"
                  selectClassName={cn("font-semibold", STATUS_CHIP[statusTone(job.status)])}
                  onChange={(status) => onChange(job.id, { status })}
                />
                <p
                  className={cn(
                    "mt-1 px-1 text-xs",
                    stale ? "font-medium text-danger" : "text-subtle",
                  )}
                >
                  {agingLabel(daysInStatus(job))}
                </p>
              </td>
              <td className="border-b border-border px-1 py-1">
                <ComboCell
                  value={job.nextAction}
                  options={NEXT_ACTION_PRESETS}
                  placeholder="Next"
                  aria-label="Next action"
                  onChange={(nextAction) => onChange(job.id, { nextAction })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <ComboCell
                  value={job.timeExpectation}
                  options={TIME_PRESETS}
                  placeholder="Time"
                  aria-label="Time expectation"
                  errorFor={timeExpectationError}
                  selectClassName={due ? "border-danger font-medium" : undefined}
                  onChange={(timeExpectation) => onChange(job.id, { timeExpectation })}
                />
              </td>
              <td className="board-sticky-actions z-10 border-b border-border px-1 py-1">
                <div className="flex flex-col gap-1">
                  {confirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(job.id);
                          setPendingDelete(null);
                        }}
                        className="inline-flex size-11 items-center justify-center rounded-sm bg-danger text-danger-fg"
                        title="Confirm delete"
                      >
                        <Check className="size-4" />
                        <span className="sr-only">Confirm delete</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        className="inline-flex size-11 items-center justify-center rounded-sm border border-border"
                        title="Keep cart"
                      >
                        <X className="size-4" />
                        <span className="sr-only">Keep cart</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        title={next ? `Advance to ${next}` : "End of pipeline"}
                        disabled={!next}
                        onClick={() => onAdvance(job.id)}
                        className="inline-flex size-11 items-center justify-center rounded-sm border border-border text-foreground disabled:opacity-30"
                      >
                        <ChevronRight className="size-4" />
                        <span className="sr-only">Advance status</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(job.id)}
                        className="inline-flex size-11 items-center justify-center rounded-sm border border-border"
                        title="Notes, phone, activity"
                      >
                        <PanelRight className="size-4" />
                        <span className="sr-only">Notes and activity</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(job.id)}
                        className="inline-flex size-11 items-center justify-center rounded-sm border border-danger/40 text-danger"
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete</span>
                      </button>
                    </>
                  )}
                </div>
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
  onAbandonBlank,
}: {
  job: CartJob;
  jobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  onCancel: () => void;
  onAbandonBlank: (id: string) => void;
}) {
  return (
    <div
      data-draft-composer
      className="border-b border-accent/40 bg-surface-2 px-2 py-2 sm:px-3"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (event.currentTarget.contains(next as Node)) return;
        if (next instanceof Element && next.closest("[data-add-cart]")) return;
        const host = event.currentTarget;
        window.setTimeout(() => {
          const active = document.activeElement;
          if (host.contains(active)) return;
          if (active instanceof Element && active.closest("[data-add-cart]")) return;
          onAbandonBlank(job.id);
        }, 0);
      }}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="px-1 text-[10px] font-semibold tracking-wide text-muted uppercase sm:text-xs">
            New cart · not on the floor until name and job #
          </p>
          <IdentityFields job={job} jobs={jobs} onChange={onChange} autoFocus ephemeral />
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

function ColumnLabel({ children }: { children: string }) {
  return (
    <span className="inline-flex h-9 items-center px-2 text-xs font-semibold tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

function flagBar(priority: CartJob["priority"]) {
  if (priority === "hot") return "shadow-[inset_3px_0_0_0_var(--color-flag-hot)]";
  if (priority === "promised") return "shadow-[inset_3px_0_0_0_var(--color-flag-promised)]";
  if (priority === "waiting") return "shadow-[inset_3px_0_0_0_var(--color-flag-waiting)]";
  return "";
}

function flagButtonClass(priority: Priority) {
  if (priority === "hot") return "border-accent text-accent";
  if (priority === "promised") return "border-foreground/40 text-foreground";
  if (priority === "waiting") return "border-[var(--color-flag-waiting)] text-[var(--color-flag-waiting)]";
  return "border-border text-subtle";
}

function FlagButton({
  priority,
  onCycle,
}: {
  priority: Priority;
  onCycle: () => void;
}) {
  return (
    <button
      type="button"
      title={`Flag: ${PRIORITY_LABEL[priority]}. Tap to change.`}
      aria-label={`Flag ${PRIORITY_LABEL[priority]}`}
      onClick={onCycle}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-sm border",
        flagButtonClass(priority),
      )}
    >
      <Flag className={cn("size-4", priority === "none" ? "opacity-50" : "fill-current")} />
    </button>
  );
}

function CartFields({
  job,
  onChange,
}: {
  job: CartJob;
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <input
        aria-label="Cart year"
        inputMode="numeric"
        value={job.cartYear}
        onChange={(event) => onChange(job.id, { cartYear: event.target.value })}
        placeholder="Year"
        className="h-11 min-w-0 rounded-sm border border-border bg-background px-2.5 text-base md:text-sm"
      />
      <ComboCell
        value={job.cartMake}
        options={CART_MAKES}
        emptyLabel="—"
        placeholder="Make"
        aria-label="Cart make"
        onChange={(cartMake) => onChange(job.id, { cartMake })}
      />
      <input
        aria-label="Cart model"
        value={job.cartModel}
        onChange={(event) => onChange(job.id, { cartModel: event.target.value })}
        placeholder="Model"
        className="h-11 min-w-0 rounded-sm border border-border bg-background px-2.5 text-base md:text-sm"
      />
      <ComboCell
        value={job.cartColor}
        options={CART_COLORS}
        emptyLabel="—"
        placeholder="Color"
        aria-label="Cart color"
        onChange={(cartColor) => onChange(job.id, { cartColor })}
      />
    </div>
  );
}

function IdentityFields({
  job,
  jobs,
  onChange,
  autoFocus = false,
  ephemeral = false,
}: {
  job: CartJob;
  jobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  autoFocus?: boolean;
  ephemeral?: boolean;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState(job.customerName);
  const [jobDraft, setJobDraft] = useState(job.jobNumber);
  const [seenName, setSeenName] = useState(job.customerName);
  const [seenJob, setSeenJob] = useState(job.jobNumber);
  const [nameWarning, setNameWarning] = useState(
    job.customerName.trim() ? customerNameError(job.customerName) ?? "" : "",
  );
  const [jobWarning, setJobWarning] = useState(
    job.jobNumber.trim() ? jobNumberWarning(job.jobNumber, jobs, job.id) : "",
  );

  if (job.customerName !== seenName) {
    setSeenName(job.customerName);
    setNameDraft(job.customerName);
    setNameWarning(job.customerName.trim() ? customerNameError(job.customerName) ?? "" : "");
  }
  if (job.jobNumber !== seenJob) {
    setSeenJob(job.jobNumber);
    setJobDraft(job.jobNumber);
    setJobWarning(job.jobNumber.trim() ? jobNumberWarning(job.jobNumber, jobs, job.id) : "");
  }

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, [autoFocus]);

  const leavingBlankRow = (next: EventTarget | null, current: EventTarget | null) => {
    if (!ephemeral) return false;
    const host =
      current instanceof Element ? current.closest("[data-draft-composer], tr") : null;
    if (focusStayedInRow(host, next)) return false;
    return !nameDraft.trim() && !jobDraft.trim();
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    const error = customerNameError(trimmed);
    if (error) {
      if (ephemeral && !jobDraft.trim()) return;
      setNameWarning(error);
      setNameDraft(trimmed);
      return;
    }
    setNameWarning("");
    setNameDraft(trimmed);
    if (trimmed !== job.customerName) onChange(job.id, { customerName: trimmed });
  };

  const commitJobNumber = () => {
    if (ephemeral && !nameDraft.trim() && !jobDraft.trim()) return;
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
    <div className="flex min-w-0 flex-col gap-1">
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
          if (leavingBlankRow(event.relatedTarget, event.currentTarget)) return;
          commitName();
        }}
        aria-invalid={Boolean(nameWarning)}
        placeholder="Customer name"
        className={cn(
          "h-11 min-w-0 w-full rounded-sm border bg-background px-2.5 text-base font-semibold md:text-sm",
          nameWarning ? "border-danger" : "border-border",
        )}
      />
      {nameWarning ? <p className="text-xs font-semibold text-danger">{nameWarning}</p> : null}
      <div className="flex min-w-0 items-center gap-1">
        <FlagButton
          priority={job.priority}
          onCycle={() => onChange(job.id, { priority: nextPriority(job.priority) })}
        />
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
            if (leavingBlankRow(event.relatedTarget, event.currentTarget)) return;
            commitJobNumber();
          }}
          aria-invalid={Boolean(jobWarning)}
          placeholder="1851"
          className={cn(
            "h-11 min-w-0 w-full rounded-sm border bg-background px-2.5 font-mono text-base md:text-sm",
            jobWarning ? "border-danger" : "border-border",
          )}
        />
      </div>
      {jobWarning ? <p className="text-xs font-semibold text-danger">{jobWarning}</p> : null}
    </div>
  );
}

