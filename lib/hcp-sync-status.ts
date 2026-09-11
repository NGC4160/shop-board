import { formatStamp } from "./format";

export type HcpSyncFeedbackResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  reason?: string;
  count?: number;
};

export function formatHcpSyncButtonLabel(busy: boolean): string {
  return busy ? "Syncing…" : "Sync";
}

/** Compact status for the Sync control — not a toast and not the old toolbar. */
export function formatHcpSyncFeedback(options: {
  busy: boolean;
  pulling?: boolean;
  armed?: boolean;
  lastResult?: HcpSyncFeedbackResult | null;
  lastSyncAt?: number | null;
  now?: number;
}): string {
  const { busy, pulling, armed, lastResult, lastSyncAt, now = Date.now() } = options;
  if (busy) return "Syncing…";
  if (armed) return "Release to sync";
  if (pulling) return "Pull to sync";
  if (lastResult && !lastResult.ok) {
    return lastResult.error || "Housecall Pro sync failed";
  }
  if (lastResult?.skipped) {
    return lastResult.reason || "Housecall Pro sync skipped";
  }
  if (lastResult?.ok) {
    const time = lastSyncAt ? formatStamp(lastSyncAt, now) : "";
    const count = lastResult.count ?? 0;
    if (count > 0) return time ? `${count} jobs · ${time}` : `${count} jobs`;
    return time ? `Up to date · ${time}` : "Up to date";
  }
  if (lastSyncAt) return `Last sync ${formatStamp(lastSyncAt, now)}`;
  return "";
}
