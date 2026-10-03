import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSharedPartsDocument,
  type SharedPartsDocument,
} from "@/lib/parts-board";

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

export async function readSharedParts(): Promise<SharedPartsDocument | null> {
  if (shouldUseFileStore()) return readFileStore();
  return readBlobStore();
}

export async function writeSharedParts(doc: SharedPartsDocument): Promise<void> {
  if (shouldUseFileStore()) {
    await writeFileStore(doc);
    return;
  }
  await writeBlobStore(doc);
}
