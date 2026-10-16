import { createId, normalizeJobNumber } from "./identity";
import { normalizeTimeframe } from "./timeframe";
import type { CartJob, CartJobDraft } from "./types";

export const emptyDraft: CartJobDraft = {
  customerName: "",
  jobNumber: "",
  phone: "",
  cartYear: "",
  cartMake: "",
  cartModel: "",
  cartColor: "",
  bay: "",
  primaryTech: "",
  status: "New Job",
  nextAction: "",
  timeExpectation: "",
  priority: "none",
  notes: "",
};

export function draftToJob(draft: CartJobDraft, existing?: CartJob): CartJob {
  const now = Date.now();
  const status = draft.status.trim() || "New Job";
  const statusChanged =
    existing && existing.status !== status ? now : (existing?.statusChangedAt ?? now);
  const history = existing?.history ? [...existing.history] : [];
  if (!existing) {
    history.push({ at: now, kind: "created", text: "Added to the board" });
  }
  return {
    id: existing?.id ?? createId(),
    customerName: draft.customerName.trim(),
    jobNumber: normalizeJobNumber(draft.jobNumber),
    phone: draft.phone.trim(),
    cartYear: draft.cartYear.trim(),
    cartMake: draft.cartMake.trim(),
    cartModel: draft.cartModel.trim(),
    cartColor: draft.cartColor.trim(),
    bay: draft.bay.trim(),
    primaryTech: draft.primaryTech.trim(),
    status,
    nextAction: draft.nextAction.trim(),
    timeExpectation: normalizeTimeframe(draft.timeExpectation),
    priority: draft.priority,
    notes: draft.notes.trim(),
    history,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    statusChangedAt: statusChanged,
    hcpScheduledStartAt: existing?.hcpScheduledStartAt ?? null,
    deletedAt: existing?.deletedAt ?? null,
  };
}

export function jobToDraft(job: CartJob): CartJobDraft {
  return {
    customerName: job.customerName,
    jobNumber: job.jobNumber,
    phone: job.phone,
    cartYear: job.cartYear,
    cartMake: job.cartMake,
    cartModel: job.cartModel,
    cartColor: job.cartColor,
    bay: job.bay,
    primaryTech: job.primaryTech,
    status: job.status,
    nextAction: job.nextAction,
    timeExpectation: job.timeExpectation,
    priority: job.priority,
    notes: job.notes,
  };
}
