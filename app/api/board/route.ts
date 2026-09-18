import {
  parseSharedBoardDocument,
  toSharedBoardDocument,
} from "@/lib/shared-board";
import {
  isSharedStoreConfigured,
  readSharedBoard,
  writeSharedBoard,
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

  const parsed = parseSharedBoardDocument(body);
  if (!parsed) return json({ ok: false, error: "Board payload was not an object" }, 400);

  const migrate =
    Boolean(body) &&
    typeof body === "object" &&
    (body as { migrate?: unknown }).migrate === true;
  const next = toSharedBoardDocument(parsed, Date.now());

  try {
    if (migrate) {
      const result = await writeSharedBoardIfEmpty(next);
      return json({
        ok: true,
        empty: false,
        configured: true,
        wrote: result.wrote,
        migrated: result.wrote,
        ...result.current,
      });
    }
    await writeSharedBoard(next);
    return json({
      ok: true,
      empty: false,
      configured: true,
      wrote: true,
      ...next,
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
