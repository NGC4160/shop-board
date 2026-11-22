import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Newest backups kept no matter how old they are. */
export const BACKUP_MIN_KEEP = 5;
/** Hard cap on backup copies per document. */
export const BACKUP_KEEP = 40;
/** Drop older copies once the newest five are safe. */
export const BACKUP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function backupObjectPath(storeName: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/:/g, "-");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `backups/${storeName}/${stamp}-${suffix}.json`;
}

/**
 * Names to delete. Newest `minKeep` always stay. Anything past `keep`, or
 * older than `maxAgeMs` after that floor, is pruned.
 */
export function backupsToPrune(
  entries: { name: string; mtimeMs: number }[],
  now: number,
  options?: { keep?: number; minKeep?: number; maxAgeMs?: number },
): string[] {
  const keep = options?.keep ?? BACKUP_KEEP;
  const minKeep = options?.minKeep ?? BACKUP_MIN_KEEP;
  const maxAgeMs = options?.maxAgeMs ?? BACKUP_MAX_AGE_MS;
  const sorted = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  const drop: string[] = [];
  sorted.forEach((entry, index) => {
    if (index >= keep) drop.push(entry.name);
    else if (index >= minKeep && now - entry.mtimeMs > maxAgeMs) drop.push(entry.name);
  });
  return drop;
}

function dataPath(...parts: string[]): string {
  return path.join(process.cwd(), ".data", ...parts);
}

export async function writeFileBackup(storeName: string, prior: unknown, at = new Date()): Promise<string> {
  const relative = backupObjectPath(storeName, at);
  const dest = dataPath(relative);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(prior), "utf8");
  await pruneFileBackups(storeName, at.getTime());
  return relative;
}

export async function pruneFileBackups(storeName: string, now = Date.now()): Promise<string[]> {
  const dir = dataPath("backups", storeName);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const info = await stat(path.join(dir, name));
        return { name, mtimeMs: info.mtimeMs };
      }),
  );
  const drop = backupsToPrune(entries, now);
  await Promise.all(drop.map((name) => unlink(path.join(dir, name))));
  return drop;
}

export async function listFileBackups(storeName: string): Promise<string[]> {
  const dir = dataPath("backups", storeName);
  try {
    const names = await readdir(dir);
    return names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => `backups/${storeName}/${name}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Copy a local backup file onto the live JSON document. Does not talk to Vercel. */
export async function restoreFileBackup(liveFileName: string, backupRelativePath: string): Promise<void> {
  const from = dataPath(backupRelativePath);
  const raw = await readFile(from, "utf8");
  JSON.parse(raw);
  const dest = dataPath(liveFileName);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, raw, "utf8");
}

async function writeBlobBackup(storeName: string, prior: unknown, at = new Date()): Promise<void> {
  const { put, list, del } = await import("@vercel/blob");
  const pathname = backupObjectPath(storeName, at);
  await put(pathname, JSON.stringify(prior), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
  });
  try {
    const prefix = `backups/${storeName}/`;
    const entries: { name: string; mtimeMs: number }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const blob of page.blobs) {
        entries.push({ name: blob.url, mtimeMs: blob.uploadedAt.getTime() });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const drop = backupsToPrune(entries, at.getTime());
    if (drop.length > 0) await del(drop);
  } catch (error) {
    console.error("Backup prune failed", error);
  }
}

/** Write the previous document before a live save. File store locally, Blob in production. */
export async function backupPriorDocument(
  storeName: string,
  prior: unknown,
  mode: "file" | "blob",
): Promise<void> {
  if (mode === "file") {
    await writeFileBackup(storeName, prior);
    return;
  }
  await writeBlobBackup(storeName, prior);
}
