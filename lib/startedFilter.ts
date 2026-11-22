import { isClosedStatus, type CartJob } from "@/lib/jobs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Main shop board list: open jobs whose Housecall Pro clock-in
 * (`work_timestamps.started_at`, stored as `hcpWorkStartedAt`) is more than
 * 7 days before `now`. Missing clock-in and closed jobs are not included.
 */
export function isOverSevenDaysStarted(
  job: Pick<CartJob, "hcpWorkStartedAt" | "status">,
  now: number,
): boolean {
  const started = job.hcpWorkStartedAt;
  if (typeof started !== "number" || !Number.isFinite(started) || started <= 0) return false;
  if (isClosedStatus(job.status)) return false;
  return now - started > SEVEN_DAYS_MS;
}

/** Main board list helper. `now` defaults here so the page render stays pure. */
export function jobsOverSevenDaysStarted<T extends Pick<CartJob, "hcpWorkStartedAt" | "status">>(
  jobs: readonly T[],
  now = Date.now(),
): T[] {
  return jobs.filter((job) => isOverSevenDaysStarted(job, now));
}
