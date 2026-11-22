import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

function signatures(secret: string, timestamp: string, rawBody: string): Buffer[] {
  const payload = `${timestamp}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(payload);
  return [Buffer.from(hmac.digest("hex")), Buffer.from(createHmac("sha256", secret).update(payload).digest("base64"))];
}

function safeEqual(left: string, right: Buffer): boolean {
  const actual = Buffer.from(left.trim());
  if (actual.length === 0 || actual.length !== right.length) return false;
  return timingSafeEqual(actual, right);
}

/**
 * Housecall Pro signs `Api-Timestamp + "." + raw JSON body` with HMAC SHA256.
 * The signing secret is `HOUSECALL_PRO_WEBHOOK_SECRET`. Unsigned requests are rejected.
 */
export function verifyHcpWebhookSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  const timestamp = timestampHeader?.trim() ?? "";
  const signature = signatureHeader?.trim() ?? "";
  if (!secret || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const stampMs = seconds > 10_000_000_000 ? seconds : seconds * 1000;
  if (Math.abs(nowMs - stampMs) > MAX_SKEW_MS) return false;
  return signatures(secret, timestamp, rawBody).some((expected) => safeEqual(signature, expected));
}

const SYNC_EVENTS = new Set([
  "job.completed",
  "job.updated",
  "job.paid",
  "job.deleted",
  "job.canceled",
  "job.started",
  "job.scheduled",
]);

export function hcpWebhookJobEvent(body: unknown): { event: string; jobId: string } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event.trim() : "";
  if (!SYNC_EVENTS.has(event)) return null;
  const job = record.job;
  const jobId =
    job && typeof job === "object" && typeof (job as { id?: unknown }).id === "string"
      ? (job as { id: string }).id.trim()
      : "";
  if (!jobId) return null;
  return { event, jobId };
}
