"use client";

import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  BAYS,
  CART_MAKES,
  PIPELINE_STATUSES,
  PRIMARY_TECHS,
  PRIORITY_LABEL,
  PRIORITIES,
  STATUS_CHIP,
  cartLabel,
  daysInStatus,
  daysOnBoard,
  nextPipelineStatus,
  prevPipelineStatus,
  statusTone,
  type CartJob,
  type Priority,
} from "@/lib/jobs";
import { ComboCell } from "@/components/shop/combo-cell";
import { formatStamp, agingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type JobDrawerProps = {
  job: CartJob | null;
  onClose: () => void;
  onChange: (id: string, patch: Partial<CartJob>) => boolean;
  onAdvance: (id: string) => void;
};

export function JobDrawer({ job, onClose, onChange, onAdvance }: JobDrawerProps) {
  const notesValue = job?.notes ?? "";
  const [notes, setNotes] = useState(notesValue);
  const [seenNotes, setSeenNotes] = useState(notesValue);
  if (notesValue !== seenNotes) {
    setSeenNotes(notesValue);
    setNotes(notesValue);
  }

  const next = job ? nextPipelineStatus(job.status) : null;
  const prev = job ? prevPipelineStatus(job.status) : null;

  return (
    <Dialog.Root open={Boolean(job)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="no-print fixed inset-0 z-40 bg-background/70 data-[state=open]:animate-in" />
        <Dialog.Content className="no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-[var(--shadow-lift)] sm:rounded-l-lg">
          {job ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <p className="font-display text-xs font-semibold tracking-[0.18em] text-accent uppercase">
                    Job {job.jobNumber || "new"}
                  </p>
                  <Dialog.Title className="mt-1 truncate text-2xl font-semibold tracking-tight">
                    {job.customerName || "Untitled cart"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted">
                    {cartLabel(job) || "No cart details yet"}
                    {job.cartColor ? ` · ${job.cartColor}` : ""}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  className="inline-flex size-11 items-center justify-center rounded-sm border border-border text-muted"
                  aria-label="Close details"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-8 items-center rounded-sm px-2.5 text-xs font-semibold",
                      STATUS_CHIP[statusTone(job.status)],
                    )}
                  >
                    {job.status}
                  </span>
                  <span className="text-xs text-muted">{agingLabel(daysInStatus(job))}</span>
                  <span className="text-xs text-subtle">
                    on board {daysOnBoard(job) === 0 ? "today" : `${daysOnBoard(job)}d`}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!prev}
                    onClick={() => prev && onChange(job.id, { status: prev })}
                    className="inline-flex h-11 items-center justify-center gap-1 rounded-sm border border-border text-sm font-medium disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!next}
                    onClick={() => onAdvance(job.id)}
                    className="inline-flex h-11 items-center justify-center gap-1 rounded-sm bg-accent px-3 text-sm font-semibold text-accent-ink disabled:opacity-40"
                  >
                    {next ? `To ${next}` : "End of pipeline"}
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <Field label="Phone">
                  <input
                    value={job.phone}
                    onChange={(event) => onChange(job.id, { phone: event.target.value })}
                    placeholder="Optional"
                    className="h-11 w-full rounded-sm border border-border bg-background px-3 text-sm"
                  />
                </Field>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Year">
                    <input
                      value={job.cartYear}
                      onChange={(event) => onChange(job.id, { cartYear: event.target.value })}
                      placeholder="2018"
                      className="h-11 w-full rounded-sm border border-border bg-background px-3 text-sm"
                    />
                  </Field>
                  <Field label="Make">
                    <ComboCell
                      value={job.cartMake}
                      options={CART_MAKES}
                      placeholder="Make"
                      onChange={(cartMake) => onChange(job.id, { cartMake })}
                    />
                  </Field>
                  <Field label="Model">
                    <input
                      value={job.cartModel}
                      onChange={(event) => onChange(job.id, { cartModel: event.target.value })}
                      placeholder="TXT 48V"
                      className="h-11 w-full rounded-sm border border-border bg-background px-3 text-sm"
                    />
                  </Field>
                  <Field label="Color">
                    <input
                      value={job.cartColor}
                      onChange={(event) => onChange(job.id, { cartColor: event.target.value })}
                      placeholder="White"
                      className="h-11 w-full rounded-sm border border-border bg-background px-3 text-sm"
                    />
                  </Field>
                </div>

                <Field label="Bay">
                  <ComboCell
                    value={job.bay}
                    options={BAYS}
                    emptyLabel="No bay"
                    placeholder="Bay"
                    onChange={(bay) => onChange(job.id, { bay })}
                  />
                </Field>
                <Field label="Tech">
                  <ComboCell
                    value={job.primaryTech}
                    options={PRIMARY_TECHS}
                    emptyLabel="Unassigned"
                    placeholder="Tech"
                    onChange={(primaryTech) => onChange(job.id, { primaryTech })}
                  />
                </Field>
                <Field label="Status">
                  <ComboCell
                    value={job.status}
                    options={PIPELINE_STATUSES}
                    placeholder="Status"
                    selectClassName={cn("font-semibold", STATUS_CHIP[statusTone(job.status)])}
                    onChange={(status) => onChange(job.id, { status })}
                  />
                </Field>
                <Field label="Flag">
                  <ComboCell
                    value={job.priority === "none" ? "" : PRIORITY_LABEL[job.priority]}
                    options={PRIORITIES.filter((item) => item !== "none").map(
                      (item) => PRIORITY_LABEL[item],
                    )}
                    emptyLabel="No flag"
                    onChange={(label) => {
                      const match = (Object.entries(PRIORITY_LABEL) as [Priority, string][]).find(
                        ([, text]) => text === label,
                      );
                      onChange(job.id, { priority: match?.[0] ?? "none" });
                    }}
                  />
                </Field>

                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    onBlur={() => {
                      if (notes !== job.notes) onChange(job.id, { notes });
                    }}
                    rows={4}
                    placeholder="Parts, promises, anything the next tech needs"
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm leading-relaxed"
                  />
                </Field>

                <section className="mt-6">
                  <h3 className="font-display text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                    Activity
                  </h3>
                  <ol className="mt-3 space-y-3">
                    {[...job.history].reverse().map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                        <div>
                          <p className="text-foreground">{entry.text}</p>
                          <p className="text-xs text-subtle">{formatStamp(entry.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                <p className="mt-8 text-xs text-subtle">
                  Diagnostics stay in CartScope. This board is the shop floor only.
                </p>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
