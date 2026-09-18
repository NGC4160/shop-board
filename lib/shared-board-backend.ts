import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSharedBoardDocument,
  type SharedBoardDocument,
} from "@/lib/shared-board";

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

async function readBlobStore(): Promise<SharedBoardDocument | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(SHARED_BOARD_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  if (!text.trim()) return null;
  return parseSharedBoardDocument(JSON.parse(text));
}

async function writeBlobStore(doc: SharedBoardDocument): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(SHARED_BOARD_BLOB_PATH, JSON.stringify(doc), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readSharedBoard(): Promise<SharedBoardDocument | null> {
  if (shouldUseFileStore()) return readFileStore();
  return readBlobStore();
}

export async function writeSharedBoard(doc: SharedBoardDocument): Promise<void> {
  if (shouldUseFileStore()) {
    await writeFileStore(doc);
    return;
  }
  await writeBlobStore(doc);
}

export async function writeSharedBoardIfEmpty(
  doc: SharedBoardDocument,
): Promise<{ wrote: boolean; current: SharedBoardDocument }> {
  const existing = await readSharedBoard();
  if (existing) return { wrote: false, current: existing };
  await writeSharedBoard(doc);
  return { wrote: true, current: doc };
}
