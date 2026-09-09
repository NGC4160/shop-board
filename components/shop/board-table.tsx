"use client";

import { useState } from "react";
import { ChevronRight, Flag, PanelRight, Trash2 } from "lucide-react";
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
  daysInStatus,
  hasDuplicateJobNumber,
  isStale,
  jobNumberError,
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

type BoardTableProps = {
  jobs: CartJob[];
  allJobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  onAdvance: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
};

export function BoardTable({
  jobs,
  allJobs,
  onChange,
  onAdvance,
  onDelete,
  onOpen,
}: BoardTableProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[18%]" />
          <col className="w-[9%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col className="w-[9%]" />
          <col className="w-[5%]" />
        </colgroup>
        <thead className="bg-surface-2 text-sm">
          <tr>
            <th className="sticky left-0 z-20 border-r border-border bg-surface-2 px-1 py-1">
              <div className="flex min-w-0 flex-col items-start gap-0.5 px-2 py-1">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Customer
                </span>
                <span className="text-xs font-semibold tracking-wide text-foreground uppercase">
                  Job #
                </span>
              </div>
            </th>
            <th className="px-1 py-1">
              <ColumnLabel>Cart</ColumnLabel>
            </th>
            <th className="px-1 py-1">
              <ColumnLabel>Bay</ColumnLabel>
            </th>
            <th className="px-1 py-1">
              <ColumnLabel>Tech</ColumnLabel>
            </th>
            <th className="px-1 py-1">
              <ColumnLabel>Status</ColumnLabel>
            </th>
            <th className="px-1 py-1">
              <ColumnLabel>Next</ColumnLabel>
            </th>
            <th className="px-1 py-1">
              <ColumnLabel>Time</ColumnLabel>
            </th>
            <th className="sticky right-0 z-20 bg-surface-2 px-1 py-1">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const next = nextPipelineStatus(job.status);
            const due = isDueToday(job);
            const stale = isStale(job);
            return (
              <tr key={job.id} className="border-t border-border align-top">
                <td
                  className={cn(
                    "sticky left-0 z-10 border-r border-border bg-surface px-1 py-1",
                    flagBar(job.priority),
                  )}
                >
                  <IdentityFields job={job} jobs={allJobs} onChange={onChange} />
                </td>
                <td className="overflow-visible px-1 py-1">
                  <CartFields job={job} onChange={onChange} />
                </td>
                <td className="overflow-visible px-1 py-1">
                  <ComboCell
                    value={job.bay}
                    options={BAYS}
                    emptyLabel="—"
                    placeholder="Bay"
                    aria-label="Bay"
                    onChange={(bay) => onChange(job.id, { bay })}
                  />
                </td>
                <td className="overflow-visible px-1 py-1">
                  <ComboCell
                    value={job.primaryTech}
                    options={PRIMARY_TECHS}
                    emptyLabel="Unassigned"
                    placeholder="Tech"
                    aria-label="Primary tech"
                    onChange={(primaryTech) => onChange(job.id, { primaryTech })}
                  />
                </td>
                <td className="overflow-visible px-1 py-1">
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
                <td className="overflow-visible px-1 py-1">
                  <ComboCell
                    value={job.nextAction}
                    options={NEXT_ACTION_PRESETS}
                    placeholder="Next"
                    aria-label="Next action"
                    onChange={(nextAction) => onChange(job.id, { nextAction })}
                  />
                </td>
                <td className="overflow-visible px-1 py-1">
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
                <td className="sticky right-0 z-10 bg-surface px-1 py-1">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      title={next ? `Advance to ${next}` : "End of pipeline"}
                      disabled={!next}
                      onClick={() => onAdvance(job.id)}
                      className="inline-flex h-11 items-center justify-center rounded-sm border border-border text-foreground disabled:opacity-30"
                    >
                      <ChevronRight className="size-4" />
                      <span className="sr-only">Advance status</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(job.id)}
                      className="inline-flex h-11 items-center justify-center rounded-sm border border-border"
                      title="Notes, phone, activity"
                    >
                      <PanelRight className="size-4" />
                      <span className="sr-only">Notes and activity</span>
                    </button>
                    {pendingDelete === job.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(job.id);
                            setPendingDelete(null);
                          }}
                          className="inline-flex h-11 items-center justify-center rounded-sm bg-danger text-sm font-semibold text-danger-fg"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="inline-flex h-11 items-center justify-center rounded-sm border border-border text-sm font-medium"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(job.id)}
                        className="inline-flex h-11 items-center justify-center rounded-sm border border-danger/40 text-danger"
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BoardCards({
  jobs,
  allJobs,
  onChange,
  onAdvance,
  onDelete,
  onOpen,
}: BoardTableProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <ul className="grid gap-3 md:hidden">
      {jobs.map((job) => {
        const next = nextPipelineStatus(job.status);
        const due = isDueToday(job);
        const stale = isStale(job);
        return (
          <li
            key={job.id}
            className={cn(
              "rounded-lg border border-border bg-surface p-3",
              flagBar(job.priority),
            )}
          >
            <div className="grid gap-2">
              <IdentityFields job={job} jobs={allJobs} onChange={onChange} />
              <FieldLabel>Cart</FieldLabel>
              <CartFields job={job} onChange={onChange} />
              <FieldLabel>Bay</FieldLabel>
              <ComboCell
                value={job.bay}
                options={BAYS}
                emptyLabel="—"
                placeholder="Bay"
                aria-label="Bay"
                onChange={(bay) => onChange(job.id, { bay })}
              />
              <FieldLabel>Primary tech</FieldLabel>
              <ComboCell
                value={job.primaryTech}
                options={PRIMARY_TECHS}
                emptyLabel="Unassigned"
                placeholder="Type a tech name"
                onChange={(primaryTech) => onChange(job.id, { primaryTech })}
              />
              <FieldLabel>Status</FieldLabel>
              <ComboCell
                value={job.status}
                options={PIPELINE_STATUSES}
                placeholder="Type a status"
                selectClassName={cn("font-semibold", STATUS_CHIP[statusTone(job.status)])}
                onChange={(status) => onChange(job.id, { status })}
              />
              <p
                className={cn(
                  "px-1 text-xs",
                  stale ? "font-medium text-danger" : "text-subtle",
                )}
              >
                {agingLabel(daysInStatus(job))}
              </p>
              <FieldLabel>Next action</FieldLabel>
              <ComboCell
                value={job.nextAction}
                options={NEXT_ACTION_PRESETS}
                placeholder="What happens next?"
                onChange={(nextAction) => onChange(job.id, { nextAction })}
              />
              <FieldLabel>Time expectation</FieldLabel>
              <ComboCell
                value={job.timeExpectation}
                options={TIME_PRESETS}
                placeholder="ETA / due / promised"
                errorFor={timeExpectationError}
                selectClassName={due ? "border-danger font-medium" : undefined}
                onChange={(timeExpectation) => onChange(job.id, { timeExpectation })}
              />
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => onAdvance(job.id)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-sm bg-accent px-3 text-sm font-semibold text-accent-ink disabled:opacity-40"
                >
                  {next ? `Advance · ${next}` : "End of pipeline"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(job.id)}
                  className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-4 text-sm font-medium"
                >
                  Notes
                </button>
                {pendingDelete === job.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(job.id);
                        setPendingDelete(null);
                      }}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-sm bg-danger text-sm font-semibold text-danger-fg"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-4 text-sm font-medium"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(job.id)}
                    className="inline-flex h-11 items-center justify-center rounded-sm border border-danger/40 px-4 text-sm font-medium text-danger"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold tracking-wide text-muted uppercase">{children}</p>;
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
        className="h-11 min-w-0 rounded-sm border border-border bg-background px-2.5 text-sm"
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
        className="h-11 min-w-0 rounded-sm border border-border bg-background px-2.5 text-sm"
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
}: {
  job: CartJob;
  jobs: CartJob[];
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
}) {
  const [nameDraft, setNameDraft] = useState(job.customerName);
  const [jobDraft, setJobDraft] = useState(job.jobNumber);
  const [seenName, setSeenName] = useState(job.customerName);
  const [seenJob, setSeenJob] = useState(job.jobNumber);
  const [warning, setWarning] = useState("");

  if (job.customerName !== seenName) {
    setSeenName(job.customerName);
    setNameDraft(job.customerName);
  }
  if (job.jobNumber !== seenJob) {
    setSeenJob(job.jobNumber);
    setJobDraft(job.jobNumber);
    setWarning("");
  }

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
      <div className="flex items-center gap-1">
        <FlagButton
          priority={job.priority}
          onCycle={() => onChange(job.id, { priority: nextPriority(job.priority) })}
        />
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
            if (trimmed !== job.customerName) onChange(job.id, { customerName: trimmed });
          }}
          placeholder="Customer name"
          className="h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-sm font-semibold"
        />
      </div>
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
        className={cn(
          "h-11 w-full rounded-sm border bg-background px-2.5 font-mono text-sm",
          warning ? "border-danger" : "border-border",
        )}
      />
      {warning ? <p className="text-xs font-semibold text-danger">{warning}</p> : null}
    </div>
  );
}
