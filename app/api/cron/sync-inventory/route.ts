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

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes("vercel-cron")) return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Poll recently completed Housecall Pro jobs and deduct inventory.
 * Read-only toward Housecall Pro. Does not write to QuickBooks.
 * `job.completed` webhooks hit the same sync for one job; this poll is the
 * path that runs without a webhook.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isPartsStoreConfigured()) {
    return Response.json(
      { ok: false, error: "Shared parts store is not configured" },
      { status: 503 },
    );
  }

  return enqueuePartsMutation(async () => {
    const current = (await readSharedParts()) ?? emptySharedPartsDocument();
    const result = await syncInventoryDocument(current, { mode: "poll" });
    if (!result.ok) {
      console.error("Inventory usage poll failed", result.error);
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }
    if (result.skipped) {
      return Response.json({ ok: true, skipped: true, reason: result.reason });
    }
    await writeSharedParts(result.doc);
    const sync = result.doc.inventorySync;
    console.info("Inventory usage poll", {
      completedJobs: sync?.completedJobs ?? 0,
      deductedLines: sync?.deductedLines ?? 0,
      reversedLines: sync?.reversedLines ?? 0,
      jobInputsAvailable: sync?.jobInputsAvailable ?? true,
    });
    return Response.json({
      ok: true,
      skipped: false,
      mode: "poll",
      completedJobs: sync?.completedJobs ?? 0,
      deductedLines: sync?.deductedLines ?? 0,
      reversedLines: sync?.reversedLines ?? 0,
      jobInputsAvailable: sync?.jobInputsAvailable ?? true,
      jobInputsDetail: sync?.jobInputsDetail ?? null,
      at: sync?.at ?? null,
    });
  });
}
