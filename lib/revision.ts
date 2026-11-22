/** Monotonic document revision. Schema `version` stays a separate field. */

export const REVISION_REQUIRED_ERROR =
  "Send the revision you loaded as the If-Match header or baseRevision, then try again.";

export const STALE_REVISION_ERROR =
  "This board changed on another device. Your edits were not saved over that copy.";

/** Legacy Blob documents with no revision field are revision 0. */
export function readStoredRevision(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const revision = (value as { revision?: unknown }).revision;
  if (typeof revision === "number" && Number.isInteger(revision) && revision >= 0) {
    return revision;
  }
  return 0;
}

export function parseIfMatchHeader(
  header: string | null,
): { ok: true; revision: number | null } | { ok: false; error: string } {
  if (header == null || header.trim() === "") return { ok: true, revision: null };
  const trimmed = header.trim();
  const match = trimmed.match(/^(?:W\/)?"(\d+)"$/) ?? trimmed.match(/^(\d+)$/);
  if (!match) {
    return { ok: false, error: "If-Match must be the board revision you loaded, for example 3." };
  }
  return { ok: true, revision: Number(match[1]) };
}

/**
 * Base revision from If-Match and/or `baseRevision`. Both may be sent; they
 * must agree. Missing both is a 400 — a PUT without a base is what let stale
 * tablets overwrite the live board.
 */
export function resolveBaseRevision(
  body: unknown,
  ifMatch: string | null,
): { ok: true; revision: number } | { ok: false; error: string } {
  const header = parseIfMatchHeader(ifMatch);
  if (!header.ok) return header;

  let fromBody: number | null = null;
  if (body && typeof body === "object" && "baseRevision" in body) {
    const raw = (body as { baseRevision?: unknown }).baseRevision;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
      return { ok: false, error: "baseRevision must be a non-negative integer." };
    }
    fromBody = raw;
  }

  if (header.revision == null && fromBody == null) {
    return { ok: false, error: REVISION_REQUIRED_ERROR };
  }
  if (header.revision != null && fromBody != null && header.revision !== fromBody) {
    return {
      ok: false,
      error: "If-Match and baseRevision do not match. Send the revision you loaded.",
    };
  }
  return { ok: true, revision: (header.revision ?? fromBody) as number };
}

export function isStaleRevision(currentRevision: number, baseRevision: number): boolean {
  return currentRevision !== baseRevision;
}
