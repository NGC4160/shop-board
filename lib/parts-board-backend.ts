import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSharedPartsDocument,
  type SharedPartsDocument,
} from "@/lib/parts-board";

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

function contentKey(doc: SharedPartsDocument | null): string {
  if (!doc) return "";
  const { updatedAt: _ignored, ...rest } = doc;
  void _ignored;
  return JSON.stringify(rest);
}

/** Test helper. */
export function resetSharedPartsDocumentCacheForTests() {
  cached = null;
  inflightRead = null;
}

async function readBlobStore(): Promise<SharedPartsDocument | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(SHARED_PARTS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  if (!text.trim()) return null;
  return parseSharedPartsDocument(JSON.parse(text));
}

async function writeBlobStore(doc: SharedPartsDocument): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(SHARED_PARTS_BLOB_PATH, JSON.stringify(doc), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Copy the document that is about to be replaced. Called before every parts
 * Blob save (and the local file store) so a bad write can be recovered from
 * `ngc-parts-board.prior.json`. No-op when there is no prior document.
 */
export async function backupPriorDocument(current: SharedPartsDocument | null): Promise<void> {
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
      .then((doc) => {
        cached = { doc, at: Date.now() };
        return doc;
      })
      .finally(() => {
        inflightRead = null;
      });
  }
  return inflightRead;
}

export async function writeSharedParts(doc: SharedPartsDocument): Promise<void> {
  if (shouldUseFileStore()) {
    const prior = await readFileStore();
    if (prior && contentKey(prior) === contentKey(doc)) return;
    await backupPriorDocument(prior);
    await writeFileStore(doc);
    return;
  }
  // Skip the put when nothing but the timestamp changed (e.g. a screen echoing
  // back the copy it just loaded). Puts are Advanced Blob operations.
  const prior = cached?.doc ?? (await readBlobStore());
  if (prior && contentKey(prior) === contentKey(doc)) {
    cached = { doc: prior, at: Date.now() };
    return;
  }
  await backupPriorDocument(prior);
  await writeBlobStore(doc);
  cached = { doc, at: Date.now() };
}
