/**
 * Restore the shop board or parts board from a timestamped backup.
 *
 * Local `next dev` (no BLOB_READ_WRITE_TOKEN) reads and writes `.data/` only:
 *
 *   npx tsx scripts/restore-board-backup.ts --list --store board
 *   npx tsx scripts/restore-board-backup.ts --store board --backup backups/ngc-shop-board/<file>.json
 *   npx tsx scripts/restore-board-backup.ts --store parts --backup backups/ngc-parts-board/<file>.json
 *
 * With BLOB_READ_WRITE_TOKEN set, the same command copies that backup object
 * onto the live blob (`ngc-shop-board.json` or `ngc-parts-board.json`).
 * That replaces production data. Pass --yes only when you mean to.
 *
 *   BLOB_READ_WRITE_TOKEN=... npx tsx scripts/restore-board-backup.ts \
 *     --store board --backup backups/ngc-shop-board/<file>.json --yes
 *
 * Do not point this at https://ngc-shop-board.vercel.app. It talks to Blob
 * storage, not the public API. After a restore, refresh open tablets so they
 * load the restored revision.
 */
import { listFileBackups, restoreFileBackup } from "../lib/document-backup";

const LIVE_FILE = {
  board: "ngc-shop-board.json",
  parts: "ngc-parts-board.json",
} as const;

const STORE_NAME = {
  board: "ngc-shop-board",
  parts: "ngc-parts-board",
} as const;

type StoreKey = keyof typeof LIVE_FILE;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function storeKey(): StoreKey {
  const value = arg("--store") ?? "board";
  if (value !== "board" && value !== "parts") {
    throw new Error("--store must be board or parts");
  }
  return value;
}

async function listBlobBackups(storeName: string): Promise<string[]> {
  const { list } = await import("@vercel/blob");
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `backups/${storeName}/`, cursor, limit: 1000 });
    names.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return names.sort();
}

async function restoreBlobBackup(livePath: string, backupPath: string): Promise<void> {
  const { get, put } = await import("@vercel/blob");
  const result = await get(backupPath, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Backup not found: ${backupPath}`);
  }
  const raw = await new Response(result.stream).text();
  JSON.parse(raw);
  await put(livePath, raw, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function main() {
  const store = storeKey();
  const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  if (hasFlag("--list")) {
    const names = useBlob
      ? await listBlobBackups(STORE_NAME[store])
      : await listFileBackups(STORE_NAME[store]);
    if (names.length === 0) console.log("No backups.");
    for (const name of names) console.log(name);
    return;
  }
  const backup = arg("--backup");
  if (!backup) {
    throw new Error("Pass --backup <path> or --list. See the script comment for examples.");
  }
  if (useBlob && !hasFlag("--yes")) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is set, so this would replace the live blob. Re-run with --yes if you mean to.",
    );
  }
  if (useBlob) {
    await restoreBlobBackup(LIVE_FILE[store], backup);
    console.log(`Restored ${backup} onto ${LIVE_FILE[store]} in Blob.`);
    return;
  }
  await restoreFileBackup(LIVE_FILE[store], backup);
  console.log(`Restored ${backup} onto .data/${LIVE_FILE[store]}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
