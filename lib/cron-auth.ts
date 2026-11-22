/**
 * Auth for Vercel cron routes (`/api/cron/sync-jobs` and `/api/cron/sync-inventory`).
 *
 * When `CRON_SECRET` is set, the request must send `Authorization: Bearer <secret>`.
 * Vercel Cron does that automatically. The `vercel-cron` user-agent is not enough.
 *
 * When `CRON_SECRET` is unset, only that user-agent (or local `next dev`) is accepted,
 * so a deploy before the secret is saved does not stop the scheduled sync.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes("vercel-cron")) return true;
  return process.env.NODE_ENV !== "production";
}
