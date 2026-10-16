import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSharedBoardDocument,
  type SharedBoardDocument,
} from "@/lib/shared-board";
import { StoreRaceError, createWriteLock } from "@/lib/store-lock";

export const SHARED_BOARD_BLOB_PATH = "ngc-shop-board.json";

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Local `next dev` / tests: one JSON file so two browser profiles can share. */
function shouldUseFileStore() {
  return !hasBlobToken() && process.env.VERCEL !== "1";
}

export function isSharedStoreConfigured() {
  return hasBlobToken() || shouldUseFileStore() || process.env.VERCEL === "1";
}

function filePath() {
  return path.join(process.cwd(), ".data", SHARED_BOARD_BLOB_PATH);
}

async function readFileStore(): Promise<SharedBoardDocument | null> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return parseSharedBoardDocument(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileStore(doc: SharedBoardDocument): Promise<void> {
  const dest = filePath();
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(doc), "utf8");
}


/** ~30s per-instance cache so many open screens share one Blob read. */
const CACHE_TTL_MS = 30_000;
let cached: { doc: SharedBoardDocument | null; at: number } | null = null;
let inflightRead: Promise<SharedBoardDocument | null> | null = null;

/** Test helper. */
export function resetSharedBoardDocumentCacheForTests() {
  cached = null;
  inflightRead = null;
}

async function readBlobStore(): Promise<{ doc: SharedBoardDocument | null; etag: string | null }> {
  const { get } = await import("@vercel/blob");
  const result = await get(SHARED_BOARD_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return { doc: null, etag: result?.blob?.etag ?? null };
  }
  const text = await new Response(result.stream).text();
  const etag = result.blob?.etag ?? null;
  if (!text.trim()) return { doc: null, etag };
  return { doc: parseSharedBoardDocument(JSON.parse(text)), etag };
}

async function writeBlobStore(doc: SharedBoardDocument, etag: string | null): Promise<void> {
  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
  try {
    await put(SHARED_BOARD_BLOB_PATH, JSON.stringify(doc), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      ...(etag ? { ifMatch: etag } : {}),
    });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) throw new StoreRaceError();
    throw error;
  }
}

async function readFresh(): Promise<{ doc: SharedBoardDocument | null; etag: string | null }> {
  if (shouldUseFileStore()) return { doc: await readFileStore(), etag: null };
  const loaded = await readBlobStore();
  cached = { doc: loaded.doc, at: Date.now() };
  return loaded;
}

export async function readSharedBoard(): Promise<SharedBoardDocument | null> {
  if (shouldUseFileStore()) return readFileStore();
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.doc;
  if (!inflightRead) {
    inflightRead = readBlobStore()
      .then((loaded) => {
        cached = { doc: loaded.doc, at: Date.now() };
        return loaded.doc;
      })
      .finally(() => {
        inflightRead = null;
      });
  }
  return inflightRead;
}

export type BoardMutation<T> =
  | { type: "write"; doc: T }
  | { type: "keep"; doc: T }
  | { type: "conflict"; current: T | null }
  | { type: "error"; status: number; error: string };

const enqueueBoardWrite = createWriteLock();

/**
 * Read the live document and write inside one queue. A blob etag miss
 * retries the mutation once so the callback can return 409 against the new copy.
 */
export async function mutateSharedBoard(
  mutate: (
    current: SharedBoardDocument | null,
  ) => BoardMutation<SharedBoardDocument> | Promise<BoardMutation<SharedBoardDocument>>,
): Promise<BoardMutation<SharedBoardDocument>> {
  return enqueueBoardWrite(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const loaded = await readFresh();
      const decision = await mutate(loaded.doc);
      if (decision.type !== "write") return decision;
      try {
        if (shouldUseFileStore()) await writeFileStore(decision.doc);
        else await writeBlobStore(decision.doc, loaded.etag);
        cached = { doc: decision.doc, at: Date.now() };
        return decision;
      } catch (error) {
        if (error instanceof StoreRaceError && attempt === 0) continue;
        throw error;
      }
    }
    const loaded = await readFresh();
    return { type: "conflict", current: loaded.doc };
  });
}

export async function writeSharedBoard(doc: SharedBoardDocument): Promise<void> {
  await mutateSharedBoard(() => ({ type: "write", doc }));
}

export async function writeSharedBoardIfEmpty(
  doc: SharedBoardDocument,
): Promise<{ wrote: boolean; current: SharedBoardDocument }> {
  const decision = await mutateSharedBoard((current) => {
    if (current) return { type: "keep", doc: current };
    return { type: "write", doc };
  });
  if (decision.type === "write") return { wrote: true, current: decision.doc };
  if (decision.type === "keep") return { wrote: false, current: decision.doc };
  return { wrote: false, current: doc };
}
