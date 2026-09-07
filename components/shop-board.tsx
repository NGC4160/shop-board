"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  PIPELINE_STATUSES,
  PRIMARY_TECHS,
  draftToJob,
  emptyDraft,
  getJobsSnapshot,
  getServerJobsSnapshot,
  isClosedStatus,
  isPipelineStatus,
  isPrimaryTech,
  jobToDraft,
  saveJobs,
  sortJobs,
  statusTone,
  subscribeJobs,
  type CartJob,
  type CartJobDraft,
  type StatusTone,
} from "@/lib/jobs";

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

export function ShopBoard() {
  const jobs = useSyncExternalStore(subscribeJobs, getJobsSnapshot, getServerJobsSnapshot);
  const [editor, setEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; job: CartJob }
    | { mode: "delete"; job: CartJob; returnTo?: "edit" }
    | null
  >(null);

  const persist = (next: CartJob[]) => {
    saveJobs(sortJobs(next));
  };

  const visibleJobs = useMemo(() => sortJobs(jobs), [jobs]);
  const openCount = visibleJobs.filter((job) => !isClosedStatus(job.status)).length;

  const saveDraft = (draft: CartJobDraft, existing?: CartJob) => {
    const nextJob = draftToJob(draft, existing);
    if (existing) {
      persist(jobs.map((job) => (job.id === existing.id ? nextJob : job)));
    } else {
      persist([nextJob, ...jobs]);
    }
    setEditor(null);
  };

  const deleteJob = (id: string) => {
    persist(jobs.filter((job) => job.id !== id));
    setEditor(null);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              Covington, LA
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Neighborhood Golf Carts
            </h1>
            <p className="mt-1 text-lg text-muted">Shop Board — carts in the shop</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="text-base text-muted">
              {openCount} open · {visibleJobs.length} total
            </p>
            <button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className="min-h-14 rounded-xl bg-accent px-6 text-lg font-bold text-accent-ink shadow-[0_0_0_1px_#8a7008] hover:brightness-110"
            >
              Add cart
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
        {visibleJobs.length === 0 ? (
          <EmptyState onAdd={() => setEditor({ mode: "create" })} />
        ) : (
          <>
            <DesktopTable
              jobs={visibleJobs}
              onEdit={(job) => setEditor({ mode: "edit", job })}
              onDelete={(job) => setEditor({ mode: "delete", job })}
            />
            <MobileCards
              jobs={visibleJobs}
              onEdit={(job) => setEditor({ mode: "edit", job })}
              onDelete={(job) => setEditor({ mode: "delete", job })}
            />
          </>
        )}
      </main>

      {editor?.mode === "create" || editor?.mode === "edit" ? (
        <JobEditor
          title={editor.mode === "create" ? "Add cart to the board" : "Edit cart"}
          initial={editor.mode === "edit" ? jobToDraft(editor.job) : emptyDraft}
          onCancel={() => setEditor(null)}
          onSave={(draft) =>
            saveDraft(draft, editor.mode === "edit" ? editor.job : undefined)
          }
          onDelete={
            editor.mode === "edit"
              ? () => setEditor({ mode: "delete", job: editor.job, returnTo: "edit" })
              : undefined
          }
        />
      ) : null}

      {editor?.mode === "delete" ? (
        <ConfirmDelete
          job={editor.job}
          onCancel={() =>
            setEditor(
              editor.returnTo === "edit" ? { mode: "edit", job: editor.job } : null,
            )
          }
          onConfirm={() => deleteJob(editor.job.id)}
        />
      ) : null}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <p className="text-2xl font-semibold">No carts on the board</p>
      <p className="mt-2 text-lg text-muted">Add a cart when a job comes in.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-6 min-h-14 rounded-xl bg-accent px-6 text-lg font-bold text-accent-ink"
      >
        Add cart
      </button>
    </div>
  );
}

function IdentityBlock({ job, compact = false }: { job: CartJob; compact?: boolean }) {
  return (
    <div>
      <p className={compact ? "text-xl font-bold leading-tight" : "text-xl font-semibold leading-tight"}>
        {job.customerName}
      </p>
      <p className="mt-1 font-mono text-base text-muted">#{job.jobNumber}</p>
    </div>
  );
}

function DesktopTable({
  jobs,
  onEdit,
  onDelete,
}: {
  jobs: CartJob[];
  onEdit: (job: CartJob) => void;
  onDelete: (job: CartJob) => void;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface lg:block">
      <table className="w-full min-w-[1080px] border-collapse text-left">
        <thead className="bg-surface-2 text-base text-muted">
          <tr>
            <th className="sticky left-0 z-20 min-w-56 border-r border-border bg-surface-2 px-4 py-4 font-semibold shadow-[6px_0_10px_-6px_rgba(0,0,0,0.65)]">
              Customer / job
            </th>
            <th className="px-4 py-4 font-semibold">Primary tech</th>
            <th className="px-4 py-4 font-semibold">Status</th>
            <th className="px-4 py-4 font-semibold">Next action</th>
            <th className="px-4 py-4 font-semibold">Time expectation</th>
            <th className="px-4 py-4 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-border">
              <td className="sticky left-0 z-10 border-r border-border bg-surface px-4 py-5 shadow-[6px_0_10px_-6px_rgba(0,0,0,0.65)]">
                <IdentityBlock job={job} />
              </td>
              <td className="px-4 py-5 text-lg">
                <PrimaryTechLabel name={job.primaryTech} />
              </td>
              <td className="px-4 py-5">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-4 py-5 text-lg">{job.nextAction || "—"}</td>
              <td className="px-4 py-5 text-lg">{job.timeExpectation || "—"}</td>
              <td className="px-4 py-5">
                <RowActions onEdit={() => onEdit(job)} onDelete={() => onDelete(job)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({
  jobs,
  onEdit,
  onDelete,
}: {
  jobs: CartJob[];
  onEdit: (job: CartJob) => void;
  onDelete: (job: CartJob) => void;
}) {
  return (
    <ul className="grid gap-4 lg:hidden">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="sm:w-52 sm:shrink-0 sm:border-r sm:border-border sm:pr-4">
              <IdentityBlock job={job} compact />
            </div>
            <div className="min-w-0 flex-1">
              <dl className="grid gap-3 text-lg">
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Primary tech
                  </dt>
                  <dd className="mt-1">
                    <PrimaryTechLabel name={job.primaryTech} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Status
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge status={job.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Next action
                  </dt>
                  <dd className="mt-1">{job.nextAction || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Time expectation
                  </dt>
                  <dd className="mt-1">{job.timeExpectation || "—"}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <RowActions onEdit={() => onEdit(job)} onDelete={() => onDelete(job)} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PrimaryTechLabel({ name }: { name: string }) {
  if (!name) {
    return <span className="text-muted">Unassigned</span>;
  }
  return <span>{name}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex min-h-10 items-center rounded-full px-3 py-1 text-sm font-bold ${STATUS_CHIP[statusTone(status)]}`}
    >
      {status}
    </span>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="min-h-12 min-w-20 rounded-xl border border-border bg-surface-2 px-4 text-base font-semibold hover:border-accent"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="min-h-12 min-w-20 rounded-xl border border-danger/50 px-4 text-base font-semibold text-danger hover:bg-danger/10"
      >
        Delete
      </button>
    </div>
  );
}

function JobEditor({
  title,
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  title: string;
  initial: CartJobDraft;
  onCancel: () => void;
  onSave: (draft: CartJobDraft) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<CartJobDraft>({
    ...initial,
    primaryTech: isPrimaryTech(initial.primaryTech) ? initial.primaryTech : "",
    status: isPipelineStatus(initial.status) ? initial.status : "New Job",
  });
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.customerName.trim() || !draft.jobNumber.trim()) {
      setError("Customer name and job number are required.");
      return;
    }
    onSave({
      ...draft,
      status: isPipelineStatus(draft.status) ? draft.status : "New Job",
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/70 p-3 sm:items-center">
      <form
        onSubmit={submit}
        className="my-auto w-full max-w-2xl overflow-visible rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-base text-muted">
          Housecall Pro job number, primary tech, pipeline status, next step, and when it is due.
        </p>

        <div className="mt-5 grid gap-4">
          <Field label="Customer name" htmlFor="customerName">
            <input
              id="customerName"
              value={draft.customerName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, customerName: event.target.value }))
              }
              className="min-h-14 w-full rounded-xl border border-border bg-background px-4 text-lg"
              placeholder="Who owns the cart?"
              autoComplete="name"
            />
          </Field>
          <Field label="Job number (Housecall Pro)" htmlFor="jobNumber">
            <input
              id="jobNumber"
              value={draft.jobNumber}
              onChange={(event) =>
                setDraft((current) => ({ ...current, jobNumber: event.target.value }))
              }
              className="min-h-14 w-full rounded-xl border border-border bg-background px-4 font-mono text-lg"
              placeholder="1842"
            />
          </Field>
          <Field label="Primary tech" htmlFor="primaryTech">
            <select
              id="primaryTech"
              value={draft.primaryTech}
              onChange={(event) =>
                setDraft((current) => ({ ...current, primaryTech: event.target.value }))
              }
              className="min-h-14 w-full rounded-xl border border-border bg-background px-4 text-lg"
            >
              <option value="">Unassigned</option>
              {PRIMARY_TECHS.map((tech) => (
                <option key={tech} value={tech}>
                  {tech}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status (Housecall Pro pipeline)" htmlFor="status">
            <StatusPicker
              id="status"
              value={draft.status}
              onChange={(status) => setDraft((current) => ({ ...current, status }))}
            />
          </Field>
          <Field label="Next action" htmlFor="nextAction">
            <input
              id="nextAction"
              value={draft.nextAction}
              onChange={(event) =>
                setDraft((current) => ({ ...current, nextAction: event.target.value }))
              }
              className="min-h-14 w-full rounded-xl border border-border bg-background px-4 text-lg"
              placeholder="What happens next?"
            />
          </Field>
          <Field label="Time expectation (ETA / due / promised)" htmlFor="timeExpectation">
            <input
              id="timeExpectation"
              value={draft.timeExpectation}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  timeExpectation: event.target.value,
                }))
              }
              className="min-h-14 w-full rounded-xl border border-border bg-background px-4 text-lg"
              placeholder="Due today 4:00 PM"
            />
          </Field>
        </div>

        {error ? <p className="mt-4 text-base font-semibold text-danger">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-14 rounded-xl border border-danger/50 px-5 text-lg font-semibold text-danger"
            >
              Delete cart
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-14 rounded-xl border border-border px-5 text-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-14 rounded-xl bg-accent px-6 text-lg font-bold text-accent-ink"
            >
              Save cart
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ConfirmDelete({
  job,
  onCancel,
  onConfirm,
}: {
  job: CartJob;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-2xl font-bold">Delete this cart?</h2>
        <p className="mt-3 text-lg text-muted">
          {job.customerName} · Job #{job.jobNumber} will be removed from the board.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-14 rounded-xl border border-border px-5 text-lg font-semibold"
          >
            Keep cart
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-14 rounded-xl bg-danger px-5 text-lg font-bold text-accent-ink"
          >
            Delete cart
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between rounded-xl border border-border bg-background px-4 text-left text-lg"
      >
        <span>{value}</span>
        <span className="ml-3 text-muted" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-background py-1 shadow-2xl"
        >
          {PIPELINE_STATUSES.map((status) => {
            const selected = status === value;
            return (
              <li key={status}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(status);
                    setOpen(false);
                  }}
                  className={`flex min-h-12 w-full items-center px-4 text-left text-base ${
                    selected ? "bg-accent text-accent-ink font-semibold" : "hover:bg-surface-2"
                  }`}
                >
                  {status}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-base font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
