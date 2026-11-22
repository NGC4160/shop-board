import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSharedPartsDocument,
  type SharedPartsDocument,
} from "@/lib/parts-board";
import { backupPriorDocument as backupDocumentHistory } from "@/lib/document-backup";
import { StoreRaceError } from "@/lib/store-lock";

/** Separate Blob object from the job board (`ngc-shop-board.json`). */
export const SHARED_PARTS_BLOB_PATH = "ngc-parts-board.json";

/** Rolling copy of the document from before the latest save. One object, not a history. */
export const SHARED_PARTS_PRIOR_BLOB_PATH = "ngc-parts-board.prior.json";

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

function priorFilePath() {
  return path.join(process.cwd(), ".data", SHARED_PARTS_PRIOR_BLOB_PATH);
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

function contentKey(doc: SharedPartsDocument | null): string {
  if (!doc) return "";
  const { updatedAt: _ignored, ...rest } = doc;
  void _ignored;
  return JSON.stringify(rest);
}

/** One rolling copy of the document about to be replaced (`ngc-parts-board.prior.json`). */
async function backupLatestPrior(current: SharedPartsDocument | null): Promise<void> {
  if (!current) return;
  const body = JSON.stringify(current);
  if (shouldUseFileStore()) {
    const dest = priorFilePath();
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body, "utf8");
    return;
  }
  const { put } = await import("@vercel/blob");
  await put(SHARED_PARTS_PRIOR_BLOB_PATH, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readFresh(): Promise<{ doc: SharedPartsDocument | null; etag: string | null }> {
  if (shouldUseFileStore()) return { doc: await readFileStore(), etag: null };
  const loaded = await readBlobStore();
  cached = { doc: loaded.doc, at: Date.now() };
  return loaded;
}

let mutationTail: Promise<void> = Promise.resolve();

/**
 * Serialize parts and inventory mutations in this instance. Both write
 * `ngc-parts-board.json`, so a qty edit and a destination edit must not
 * read-modify-write over each other.
 */
export function enqueuePartsMutation<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationTail.then(task, task);
  mutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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

async function commitPartsDocument(
  current: SharedPartsDocument | null,
  doc: SharedPartsDocument,
  etag: string | null,
): Promise<void> {
  if (current && contentKey(current) === contentKey(doc)) {
    cached = { doc: current, at: Date.now() };
    return;
  }
  if (current) {
    await backupLatestPrior(current);
    await backupDocumentHistory(
      "ngc-parts-board",
      current,
      shouldUseFileStore() ? "file" : "blob",
    );
  }
  if (shouldUseFileStore()) await writeFileStore(doc);
  else await writeBlobStore(doc, etag);
  cached = { doc, at: Date.now() };
}

/** Read the live parts document and write inside the parts queue. */
export async function mutateSharedParts(
  mutate: (
    current: SharedPartsDocument | null,
  ) => PartsMutation<SharedPartsDocument> | Promise<PartsMutation<SharedPartsDocument>>,
): Promise<PartsMutation<SharedPartsDocument>> {
  return enqueuePartsMutation(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const loaded = await readFresh();
      const decision = await mutate(loaded.doc);
      if (decision.type !== "write") return decision;
      try {
        if (loaded.doc && contentKey(loaded.doc) === contentKey(decision.doc)) {
          cached = { doc: loaded.doc, at: Date.now() };
          return { type: "keep" as const, doc: loaded.doc };
        }
        await commitPartsDocument(loaded.doc, decision.doc, loaded.etag);
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

/**
 * Write a document that was already read inside `enqueuePartsMutation`.
 * Does not take the queue again — inventory routes already hold it.
 */
export async function writeSharedParts(doc: SharedPartsDocument): Promise<void> {
  const current = shouldUseFileStore() ? await readFileStore() : (cached?.doc ?? (await readBlobStore()).doc);
  await commitPartsDocument(current, doc, null);
}
