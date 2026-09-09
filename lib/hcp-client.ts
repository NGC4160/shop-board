import { applyHcpJobs, getBoardSnapshot } from "@/lib/board-store";
import { shouldSyncHcpNow } from "@/lib/chicago";
import type { HcpOpenJob } from "@/lib/hcp";

export type ClientHcpSyncResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  error?: string;
  added: number;
  updated: number;
  count: number;
};

type HcpApiResponse = {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  jobs?: HcpOpenJob[];
};

let inflight: Promise<ClientHcpSyncResult> | null = null;

async function runHcpClientSync(): Promise<ClientHcpSyncResult> {
  if (!shouldSyncHcpNow(getBoardSnapshot().lastHcpSyncAt)) {
    return {
      ok: true,
      skipped: true,
      reason: "Already synced after 7:00 AM America/Chicago today",
      added: 0,
      updated: 0,
      count: 0,
    };
  }

  const response = await fetch("/api/jobs/hcp", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as HcpApiResponse | null;
  if (!response.ok || !body) {
    return {
      ok: false,
      skipped: false,
      error: body?.error || `Housecall Pro sync failed (${response.status})`,
      added: 0,
      updated: 0,
      count: 0,
    };
  }
  if (body.skipped) {
    return {
      ok: true,
      skipped: true,
      reason: body.reason || "Housecall Pro sync skipped",
      added: 0,
      updated: 0,
      count: 0,
    };
  }
  if (body.ok === false) {
    return {
      ok: false,
      skipped: false,
      error: body.error || "Housecall Pro sync failed",
      added: 0,
      updated: 0,
      count: 0,
    };
  }

  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const { added, updated } = applyHcpJobs(jobs);
  return {
    ok: true,
    skipped: false,
    added,
    updated,
    count: jobs.length,
  };
}

export async function maybeSyncFromHcp(): Promise<ClientHcpSyncResult> {
  if (typeof window === "undefined") {
    return { ok: true, skipped: true, reason: "server", added: 0, updated: 0, count: 0 };
  }
  if (inflight) return inflight;
  inflight = runHcpClientSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function startHcpMorningSync(
  onResult?: (result: ClientHcpSyncResult) => void,
): () => void {
  let stopped = false;

  const run = () => {
    if (stopped) return;
    void maybeSyncFromHcp().then((result) => {
      if (!stopped) onResult?.(result);
    });
  };

  run();
  const interval = window.setInterval(run, 60_000);
  const onVis = () => {
    if (document.visibilityState === "visible") run();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVis);
  };
}
