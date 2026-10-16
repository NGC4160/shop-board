import { authorizePartsWrite, isPartsWriteConfigured } from "@/lib/parts-auth";
import { removePartLine, upsertPartLine } from "@/lib/parts";
import { STALE_REVISION_ERROR, resolveBaseRevision } from "@/lib/revision";
import { validatePartUpsertFields } from "@/lib/validate-parts";
import {
  applyIncomingPartsPut,
  emptySharedPartsDocument,
  toSharedPartsDocument,
} from "@/lib/parts-board";
import {
  isPartsStoreConfigured,
  mutateSharedParts,
  readSharedParts,
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

  const base = resolveBaseRevision(body, request.headers.get("if-match"));
  if (!base.ok) return json({ ok: false, error: base.error }, 400);

  try {
    const decision = await mutateSharedParts((current) => {
      const result = applyIncomingPartsPut(current, body, Date.now(), base.revision);
      if (!result.ok && result.conflict) return { type: "conflict" as const, current: result.current };
      if (!result.ok) return { type: "error" as const, status: 400, error: result.error };
      return { type: "write" as const, doc: result.doc };
    });
    if (decision.type === "conflict") {
      const current = decision.current ?? emptySharedPartsDocument(0, 0);
      return json(
        {
          ok: false,
          conflict: true,
          error: STALE_REVISION_ERROR,
          ...current,
        },
        409,
      );
    }
    if (decision.type === "error") return json({ ok: false, error: decision.error }, decision.status);
    if (decision.type !== "write" && decision.type !== "keep") {
      return json({ ok: false, error: "Shared parts store could not be written" }, 502);
    }
    const next = decision.doc;
    return json({
      ok: true,
      empty: next.parts.length === 0,
      configured: true,
      wrote: decision.type === "write",
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
    const fieldError = validatePartUpsertFields(body);
    if (fieldError) return json({ ok: false, error: fieldError }, 400);
    const decision = await mutateSharedParts((current) => {
      const base = current ?? emptySharedPartsDocument(0, 0);
      const result = upsertPartLine(base.parts, body);
      if (!result.ok) return { type: "error" as const, status: 400, error: result.error };
      return {
        type: "write" as const,
        doc: toSharedPartsDocument({ parts: result.parts }, Date.now(), base.revision + 1),
        upserted: result.line,
      };
    });
    if (decision.type === "error") return json({ ok: false, error: decision.error }, decision.status);
    if (decision.type !== "write") {
      return json({ ok: false, error: "Shared parts store could not be written" }, 502);
    }
    return json({
      ok: true,
      empty: decision.doc.parts.length === 0,
      configured: true,
      wrote: true,
      upserted: decision.upserted,
      ...decision.doc,
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
    const decision = await mutateSharedParts((current) => {
      const base = current ?? emptySharedPartsDocument(0, 0);
      const result = removePartLine(base.parts, target.incoming);
      if (!result.ok) {
        return {
          type: "error" as const,
          status: result.missing ? 404 : 400,
          error: result.error,
        };
      }
      return {
        type: "write" as const,
        doc: toSharedPartsDocument({ parts: result.parts }, Date.now(), base.revision + 1),
        removed: result.removed,
      };
    });
    if (decision.type === "error") return json({ ok: false, error: decision.error }, decision.status);
    if (decision.type !== "write") {
      return json({ ok: false, error: "Shared parts store could not be written" }, 502);
    }
    return json({
      ok: true,
      empty: decision.doc.parts.length === 0,
      configured: true,
      wrote: true,
      removed: decision.removed,
      ...decision.doc,
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
