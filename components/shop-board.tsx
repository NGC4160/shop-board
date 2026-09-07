"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  SUGGESTED_STATUSES,
  draftToJob,
  emptyDraft,
  getJobsSnapshot,
  getServerJobsSnapshot,
  jobToDraft,
  saveJobs,
  sortJobs,
  statusTone,
  subscribeJobs,
  type CartJob,
  type CartJobDraft,
} from "@/lib/jobs";

const STATUS_CHIP: Record<ReturnType<typeof statusTone>, string> = {
  bay: "bg-bay text-accent-ink",
  parts: "bg-parts text-accent-ink",
  deposit: "bg-deposit text-accent-ink",
  ready: "bg-ready text-accent-ink",
  done: "bg-surface-2 text-muted border border-border",
  wait: "bg-wait text-accent-ink",
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
  const openCount = visibleJobs.filter((job) => job.status.toLowerCase() !== "done").length;

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
      <table className="w-full min-w-[960px] border-collapse text-left">
        <thead className="bg-surface-2 text-base text-muted">
          <tr>
            <th className="px-4 py-4 font-semibold">Customer name</th>
            <th className="px-4 py-4 font-semibold">Job number</th>
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
              <td className="px-4 py-5 text-xl font-semibold">{job.customerName}</td>
              <td className="px-4 py-5 font-mono text-lg">#{job.jobNumber}</td>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold leading-tight">{job.customerName}</h2>
              <p className="mt-1 font-mono text-lg text-muted">Job #{job.jobNumber}</p>
            </div>
            <StatusBadge status={job.status} />
          </div>
          <dl className="mt-4 grid gap-3 text-lg">
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
        </li>
      ))}
    </ul>
  );
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
  const [draft, setDraft] = useState(initial);
  const [customStatus, setCustomStatus] = useState(
    SUGGESTED_STATUSES.includes(initial.status as (typeof SUGGESTED_STATUSES)[number])
      ? ""
      : initial.status,
  );
  const [error, setError] = useState("");
  const usingCustom = customStatus.length > 0 || !SUGGESTED_STATUSES.includes(draft.status as (typeof SUGGESTED_STATUSES)[number]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.customerName.trim() || !draft.jobNumber.trim()) {
      setError("Customer name and job number are required.");
      return;
    }
    onSave({
      ...draft,
      status: usingCustom && customStatus.trim() ? customStatus.trim() : draft.status,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-base text-muted">
          Housecall Pro job number, status, next step, and when it is due.
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
          <fieldset>
            <legend className="mb-2 text-base font-semibold">Status</legend>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_STATUSES.map((status) => {
                const selected = !usingCustom && draft.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setCustomStatus("");
                      setDraft((current) => ({ ...current, status }));
                    }}
                    className={`min-h-12 rounded-xl px-4 text-base font-semibold ${
                      selected
                        ? STATUS_CHIP[statusTone(status)]
                        : "border border-border bg-background text-foreground"
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block text-sm font-semibold text-muted" htmlFor="customStatus">
              Or type a custom status
            </label>
            <input
              id="customStatus"
              value={customStatus}
              onChange={(event) => {
                setCustomStatus(event.target.value);
                setDraft((current) => ({ ...current, status: event.target.value }));
              }}
              className="mt-1 min-h-12 w-full rounded-xl border border-border bg-background px-4 text-base"
              placeholder="Free text is OK"
            />
          </fieldset>
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
