import { applyHcpJobs, getBoardSnapshot } from "@/lib/board-store";
import type { HcpOpenJob } from "@/lib/hcp";
import { shouldRunHcpClientFetch } from "@/lib/hcp-merge";

export type ClientHcpSyncResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  error?: string;
  added: number;
  updated: number;
  removed: number;
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
let inflightForce = false;
/** One forced re-apply per page load after stale shop names / missing schedule starts merge. */
let staleCompanyResyncDone = false;

async function runHcpClientSync(force: boolean): Promise<ClientHcpSyncResult> {
  // subscribeBoard hydrates localStorage on a microtask; wait so skip/force
  // sees lastHcpSyncAt and any leftover "Neighborhood Golf Carts" names.
  await Promise.resolve();
  const snapshot = getBoardSnapshot();
  if (
    !shouldRunHcpClientFetch(
      snapshot.lastHcpSyncAt,
      snapshot.jobs,
      Date.now(),
      staleCompanyResyncDone,
      force,
    )
  ) {
    return {
      ok: true,
      skipped: true,
      reason: "Already synced after 7:00 AM America/Chicago today",
      added: 0,
      updated: 0,
      removed: 0,
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
      removed: 0,
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
      removed: 0,
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
      removed: 0,
      count: 0,
    };
  }

  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const { added, updated, removed } = applyHcpJobs(jobs);
  staleCompanyResyncDone = true;
  return {
    ok: true,
    skipped: false,
    added,
    updated,
    removed,
    count: jobs.length,
  };
}

export async function syncFromHcp(force = false): Promise<ClientHcpSyncResult> {
  if (typeof window === "undefined") {
    return { ok: true, skipped: true, reason: "server", added: 0, updated: 0, removed: 0, count: 0 };
  }
  if (inflight && (inflightForce || !force)) return inflight;
  if (inflight && force && !inflightForce) {
    await inflight;
    return syncFromHcp(true);
  }
  inflightForce = force;
  inflight = runHcpClientSync(force).finally(() => {
    inflight = null;
    inflightForce = false;
  });
  return inflight;
}

export async function maybeSyncFromHcp(): Promise<ClientHcpSyncResult> {
  return syncFromHcp(false);
}

/** Pull-to-refresh / manual sync — hits `/api/jobs/hcp` even after the 7am merge. */
export async function refreshHcpJobs(): Promise<ClientHcpSyncResult> {
  return syncFromHcp(true);
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
