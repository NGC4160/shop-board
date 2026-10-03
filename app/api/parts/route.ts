import { authorizePartsWrite, isPartsWriteConfigured } from "@/lib/parts-auth";
import { upsertPartLine } from "@/lib/parts";
import {
  emptySharedPartsDocument,
  parseSharedPartsDocument,
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

/** Shop-floor snapshot write. Writes `ngc-parts-board.json` only — never the job board. */
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

  const parsed = parseSharedPartsDocument(body);
  if (!parsed) return json({ ok: false, error: "Parts payload was not an object" }, 400);

  const next = toSharedPartsDocument(parsed, Date.now());

  try {
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
