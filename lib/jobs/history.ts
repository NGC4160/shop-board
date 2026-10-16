import type { CartJob, HistoryKind, JobHistory } from "./types";

export function appendHistory(
  job: CartJob,
  kind: HistoryKind,
  text: string,
): JobHistory[] {
  return [...job.history, { at: Date.now(), kind, text }].slice(-40);
}
