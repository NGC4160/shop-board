import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSharedPartsDocument,
  type SharedPartsDocument,
} from "@/lib/parts-board";
import { backupPriorDocument } from "@/lib/document-backup";
import { StoreRaceError, createWriteLock } from "@/lib/store-lock";

/** Separate Blob object from the job board (`ngc-shop-board.json`). */
export const SHARED_PARTS_BLOB_PATH = "ngc-parts-board.json";

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Local `next dev` / tests: one JSON file so two browser profiles can share. */
function shouldUseFileStore() {
  return !hasBlobToken() && process.env.VERCEL !== "1";
}

export function isPartsStoreConfigured() {
  return hasBlobToken() || shouldUseFileStore() || process.env.VERCEL === "1";
}

function filePath() {
  return path.join(process.cwd(), ".data", SHARED_PARTS_BLOB_PATH);
}

async function readFileStore(): Promise<SharedPartsDocument | null> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return parseSharedPartsDocument(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileStore(doc: SharedPartsDocument): Promise<void> {
  const dest = filePath();
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(doc), "utf8");
}


/** ~30s per-instance cache so many open screens share one Blob read. */
const CACHE_TTL_MS = 30_000;
let cached: { doc: SharedPartsDocument | null; at: number } | null = null;
let inflightRead: Promise<SharedPartsDocument | null> | null = null;

/** Test helper. */
export function resetSharedPartsDocumentCacheForTests() {
  cached = null;
  inflightRead = null;
}

async function readBlobStore(): Promise<{ doc: SharedPartsDocument | null; etag: string | null }> {
  const { get } = await import("@vercel/blob");
  const result = await get(SHARED_PARTS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return { doc: null, etag: result?.blob?.etag ?? null };
  }
  const text = await new Response(result.stream).text();
  const etag = result.blob?.etag ?? null;
  if (!text.trim()) return { doc: null, etag };
  return { doc: parseSharedPartsDocument(JSON.parse(text)), etag };
}

async function writeBlobStore(doc: SharedPartsDocument, etag: string | null): Promise<void> {
  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
  try {
    await put(SHARED_PARTS_BLOB_PATH, JSON.stringify(doc), {
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

async function readFresh(): Promise<{ doc: SharedPartsDocument | null; etag: string | null }> {
  if (shouldUseFileStore()) return { doc: await readFileStore(), etag: null };
  const loaded = await readBlobStore();
  cached = { doc: loaded.doc, at: Date.now() };
  return loaded;
}

export async function readSharedParts(): Promise<SharedPartsDocument | null> {
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

export type PartsMutation<T> =
  | { type: "write"; doc: T; upserted?: unknown; removed?: unknown }
  | { type: "keep"; doc: T }
  | { type: "conflict"; current: T | null }
  | { type: "error"; status: number; error: string };

const enqueuePartsWrite = createWriteLock();

/** Read the live parts document and write inside one queue. */
export async function mutateSharedParts(
  mutate: (
    current: SharedPartsDocument | null,
  ) => PartsMutation<SharedPartsDocument> | Promise<PartsMutation<SharedPartsDocument>>,
): Promise<PartsMutation<SharedPartsDocument>> {
  return enqueuePartsWrite(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const loaded = await readFresh();
      const decision = await mutate(loaded.doc);
      if (decision.type !== "write") return decision;
      if (loaded.doc) {
        await backupPriorDocument(
          "ngc-parts-board",
          loaded.doc,
          shouldUseFileStore() ? "file" : "blob",
        );
      }
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

export async function writeSharedParts(doc: SharedPartsDocument): Promise<void> {
  await mutateSharedParts(() => ({ type: "write", doc }));
}
