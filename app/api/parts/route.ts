import { authorizePartsWrite, isPartsWriteConfigured } from "@/lib/parts-auth";
import { removePartLine, upsertPartLine } from "@/lib/parts";
import {
  applyIncomingPartsPut,
  emptySharedPartsDocument,
  toSharedPartsDocument,
} from "@/lib/parts-board";
import {
  isPartsStoreConfigured,
  readSharedParts,
  writeSharedParts,
} from "@/lib/parts-board-backend";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: noStore });
}

function partsWriteUnauthorized(request: Request): Response | null {
  if (!isPartsWriteConfigured()) {
    return json(
      {
        ok: false,
        error: "PARTS_WRITE_TOKEN is not configured on this deployment.",
      },
      503,
    );
  }
  if (!authorizePartsWrite(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return null;
}

function partsStoreUnavailable(): Response | null {
  if (isPartsStoreConfigured()) return null;
  return json(
    {
      ok: false,
      configured: false,
      error:
        "Shared parts store is not configured. Add a Vercel Blob store and set BLOB_READ_WRITE_TOKEN.",
    },
    503,
  );
}

/** Prefer `?id=`; otherwise the JSON body (same `{ id }` shape as POST). */
async function readDeleteTarget(request: Request): Promise<
  { ok: true; incoming: unknown } | { ok: false; response: Response }
> {
  const queryId = new URL(request.url).searchParams.get("id");
  const raw = await request.text();
  let body: unknown = null;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      if (!queryId?.trim()) return { ok: false, response: json({ ok: false, error: "Invalid JSON" }, 400) };
    }
  }
  return { ok: true, incoming: queryId?.trim() ? queryId : body };
}

export async function GET() {
  if (!isPartsStoreConfigured()) {
    return json({ ok: true, empty: true, configured: false, parts: [] });
  }
  try {
    const doc = await readSharedParts();
    if (!doc) return json({ ok: true, empty: true, configured: true, parts: [] });
    return json({ ok: true, empty: false, configured: true, ...doc });
  } catch (error) {
    console.error("Shared parts read failed", error);
    return json(
      {
        ok: false,
        empty: false,
        configured: true,
        error: "Shared parts store could not be read",
      },
      502,
    );
  }
}

/**
 * Shop-floor snapshot write. No PARTS_WRITE_TOKEN — same open pattern as
 * PUT /api/board — so Ryan/Jesse can edit in a browser. Putting the bot token
 * on this page would also unlock POST/DELETE. Merges by line so a stale
 * tablet cannot wipe rows added after it loaded. Writes ngc-parts-board.json
 * only — never the job board.
 */
export async function PUT(request: Request) {
  if (!isPartsStoreConfigured()) {
    return json(
      {
        ok: false,
        configured: false,
        error:
          "Shared parts store is not configured. Add a Vercel Blob store and set BLOB_READ_WRITE_TOKEN.",
      },
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  try {
    const current = await readSharedParts();
    const result = applyIncomingPartsPut(current, body);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);
    const next = result.doc;
    await writeSharedParts(next);
    return json({
      ok: true,
      empty: next.parts.length === 0,
      configured: true,
      wrote: true,
      ...next,
    });
  } catch (error) {
    console.error("Shared parts write failed", error);
    return json(
      {
        ok: false,
        configured: true,
        error: "Shared parts store could not be written",
      },
      502,
    );
  }
}

/**
 * Token-gated upsert for the Parts process.
 * Authorization: Bearer $PARTS_WRITE_TOKEN
 * Body: one part line with a stable `id`. Merges into the parts store only.
 */
export async function POST(request: Request) {
  const denied = partsWriteUnauthorized(request);
  if (denied) return denied;
  const unavailable = partsStoreUnavailable();
  if (unavailable) return unavailable;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  try {
    const current = (await readSharedParts()) ?? emptySharedPartsDocument();
    const result = upsertPartLine(current.parts, body);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);
    const next = toSharedPartsDocument({ parts: result.parts }, Date.now());
    await writeSharedParts(next);
    return json({
      ok: true,
      empty: next.parts.length === 0,
      configured: true,
      wrote: true,
      upserted: result.line,
      ...next,
    });
  } catch (error) {
    console.error("Parts upsert failed", error);
    return json(
      {
        ok: false,
        configured: true,
        error: "Shared parts store could not be written",
      },
      502,
    );
  }
}

/**
 * Token-gated remove for the Parts process (same Bearer token as POST).
 * Authorization: Bearer $PARTS_WRITE_TOKEN
 * Target: `?id=` or JSON `{ "id": "…" }`. Removes that line only.
 */
export async function DELETE(request: Request) {
  const denied = partsWriteUnauthorized(request);
  if (denied) return denied;
  const unavailable = partsStoreUnavailable();
  if (unavailable) return unavailable;

  const target = await readDeleteTarget(request);
  if (!target.ok) return target.response;

  try {
    const current = (await readSharedParts()) ?? emptySharedPartsDocument();
    const result = removePartLine(current.parts, target.incoming);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.missing ? 404 : 400);
    }
    const next = toSharedPartsDocument({ parts: result.parts }, Date.now());
    await writeSharedParts(next);
    return json({
      ok: true,
      empty: next.parts.length === 0,
      configured: true,
      wrote: true,
      removed: result.removed,
      ...next,
    });
  } catch (error) {
    console.error("Parts delete failed", error);
    return json(
      {
        ok: false,
        configured: true,
        error: "Shared parts store could not be written",
      },
      502,
    );
  }
}
