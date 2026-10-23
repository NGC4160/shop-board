import { hcpWebhookJobEvent, verifyHcpWebhookSignature } from "@/lib/hcp-webhook";
import { syncInventoryDocument } from "@/lib/inventory-hcp-sync";
import { emptySharedPartsDocument } from "@/lib/parts-board";
import {
  enqueuePartsMutation,
  isPartsStoreConfigured,
  readSharedParts,
  writeSharedParts,
} from "@/lib/parts-board-backend";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Optional Housecall Pro `job.completed` (and reopen/update) webhook.
 * The handler only GETs the job, its material line items, and its material
 * job inputs. It does not write to Housecall Pro or QuickBooks.
 * Without HOUSECALL_PRO_WEBHOOK_SECRET the route refuses the call.
 * The scheduled poll at /api/cron/sync-inventory does the same work when
 * this webhook is not configured.
 */
export async function POST(request: Request) {
  const secret = process.env.HOUSECALL_PRO_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error:
          "HOUSECALL_PRO_WEBHOOK_SECRET is not set. Inventory still updates from the scheduled poll.",
      },
      { status: 503 },
    );
  }

  const raw = await request.text();
  const timestamp = request.headers.get("api-timestamp");
  const signature = request.headers.get("api-signature");
  if (!verifyHcpWebhookSignature(raw, timestamp, signature, secret)) {
    return Response.json({ ok: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const event = hcpWebhookJobEvent(body);
  if (!event) {
    return Response.json({ ok: true, ignored: true });
  }
  if (!isPartsStoreConfigured()) {
    return Response.json({ ok: false, error: "Shared parts store is not configured" }, { status: 503 });
  }

  return enqueuePartsMutation(async () => {
    const current = (await readSharedParts()) ?? emptySharedPartsDocument();
    const result = await syncInventoryDocument(current, { mode: "webhook", jobId: event.jobId });
    if (!result.ok) {
      console.error("Inventory webhook sync failed", result.error);
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }
    if (!result.skipped) await writeSharedParts(result.doc);
    return Response.json({
      ok: true,
      ignored: false,
      event: event.event,
      skipped: result.skipped,
      jobInputsAvailable: result.doc.inventorySync?.jobInputsAvailable ?? true,
    });
  });
}
