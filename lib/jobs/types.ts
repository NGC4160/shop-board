import type { Priority } from "./catalog";

export type HistoryKind = "created" | "status" | "tech" | "note" | "edit";

export type JobHistory = {
  at: number;
  kind: HistoryKind;
  text: string;
};

export type CartJob = {
  id: string;
  customerName: string;
  jobNumber: string;
  phone: string;
  cartYear: string;
  cartMake: string;
  cartModel: string;
  cartColor: string;
  bay: string;
  primaryTech: string;
  status: string;
  nextAction: string;
  timeExpectation: string;
  priority: Priority;
  notes: string;
  history: JobHistory[];
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
  /** Housecall Pro `schedule.scheduled_start`. Null when unknown — never invented. */
  hcpScheduledStartAt: number | null;
};

export type CartJobDraft = {
  customerName: string;
  jobNumber: string;
  phone: string;
  cartYear: string;
  cartMake: string;
  cartModel: string;
  cartColor: string;
  bay: string;
  primaryTech: string;
  status: string;
  nextAction: string;
  timeExpectation: string;
  priority: Priority;
  notes: string;
};
