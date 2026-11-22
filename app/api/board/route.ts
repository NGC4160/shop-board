import { STALE_REVISION_ERROR, resolveBaseRevision } from "@/lib/revision";
import {
  applyIncomingBoardPut,
  emptySharedBoardDocument,
  toSharedBoardDocument,
} from "@/lib/shared-board";
import { validateBoardPut } from "@/lib/validate-board";
import {
  isSharedStoreConfigured,
  mutateSharedBoard,
  readSharedBoard,
  writeSharedBoardIfEmpty,
} from "@/lib/shared-board-backend";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: noStore });
}

export async function GET() {
  if (!isSharedStoreConfigured()) {
    return json({ ok: true, empty: true, configured: false });
  }
  try {
    const doc = await readSharedBoard();
    if (!doc) return json({ ok: true, empty: true, configured: true });
    return json({ ok: true, empty: false, configured: true, ...doc });
  } catch (error) {
    console.error("Shared board read failed", error);
    return json(
      {
        ok: false,
        empty: false,
        configured: true,
        error: "Shared board store could not be read",
      },
      502,
    );
  }
}

export async function PUT(request: Request) {
  if (!isSharedStoreConfigured()) {
    return json(
      {
        ok: false,
        configured: false,
        error:
          "Shared board store is not configured. Add a Vercel Blob store and set BLOB_READ_WRITE_TOKEN.",
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

  const validated = validateBoardPut(body);
  if (!validated.ok) return json({ ok: false, error: validated.error }, 400);

  const base = resolveBaseRevision(body, request.headers.get("if-match"));
  if (!base.ok) return json({ ok: false, error: base.error }, 400);

  const migrate =
    Boolean(body) &&
    typeof body === "object" &&
    (body as { migrate?: unknown }).migrate === true;

  try {
    if (migrate) {
      const seeded = toSharedBoardDocument(validated.value, Date.now(), 1);
      const result = await writeSharedBoardIfEmpty(seeded);
      return json({
        ok: true,
        empty: false,
        configured: true,
        wrote: result.wrote,
        migrated: result.wrote,
        ...result.current,
      });
    }
    const decision = await mutateSharedBoard((current) => {
      const applied = applyIncomingBoardPut(current, validated.value, base.revision);
      if (!applied.ok) return { type: "conflict" as const, current: applied.current };
      return { type: "write" as const, doc: applied.doc };
    });
    if (decision.type === "conflict") {
      const current = decision.current ?? emptySharedBoardDocument();
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
    if (decision.type !== "write" && decision.type !== "keep") {
      return json({ ok: false, error: "Shared board store could not be written" }, 502);
    }
    return json({
      ok: true,
      empty: false,
      configured: true,
      wrote: decision.type === "write",
      ...decision.doc,
    });
  } catch (error) {
    console.error("Shared board write failed", error);
    return json(
      {
        ok: false,
        configured: true,
        error: "Shared board store could not be written",
      },
      502,
    );
  }
}
