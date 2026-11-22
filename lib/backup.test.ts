import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import {
  BACKUP_KEEP,
  backupsToPrune,
  listFileBackups,
  restoreFileBackup,
  writeFileBackup,
} from "./document-backup.ts";
import { resetSharedBoardDocumentCacheForTests } from "./shared-board-backend.ts";

describe("backup prune", () => {
  it("keeps the newest five even when they are old, and caps the rest", () => {
    const now = Date.UTC(2026, 9, 16);
    const day = 24 * 60 * 60 * 1000;
    const entries = Array.from({ length: 8 }, (_, index) => ({
      name: `b${index}`,
      mtimeMs: now - (index + 40) * day,
    }));
    const drop = backupsToPrune(entries, now, { keep: 6, minKeep: 5, maxAgeMs: 30 * day });
    assert.deepEqual(drop.sort(), ["b5", "b6", "b7"]);
  });

  it("drops copies past the keep cap", () => {
    const entries = Array.from({ length: BACKUP_KEEP + 2 }, (_, index) => ({
      name: `n${index}`,
      mtimeMs: 1_000 + index,
    }));
    const drop = backupsToPrune(entries, 2_000);
    assert.equal(drop.length, 2);
  });
});

describe("file backup before write", () => {
  const originalCwd = process.cwd();
  let dataRoot = "";

  before(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ngc-backup-"));
    process.chdir(dataRoot);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    resetSharedBoardDocumentCacheForTests();
  });

  after(async () => {
    process.chdir(originalCwd);
    resetSharedBoardDocumentCacheForTests();
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("stores the prior document and can copy it back", async () => {
    const prior = { revision: 1, jobs: [seedJobs[0]], note: "before" };
    const relative = await writeFileBackup("ngc-shop-board", prior, new Date("2026-10-16T04:00:00.000Z"));
    const saved = JSON.parse(await readFile(path.join(dataRoot, ".data", relative), "utf8")) as {
      note: string;
    };
    assert.equal(saved.note, "before");
    assert.deepEqual(await listFileBackups("ngc-shop-board"), [relative]);

    await restoreFileBackup("ngc-shop-board.json", relative);
    const restored = JSON.parse(
      await readFile(path.join(dataRoot, ".data", "ngc-shop-board.json"), "utf8"),
    ) as { revision: number };
    assert.equal(restored.revision, 1);
  });

  it("writes a backup before the second board PUT", async () => {
    await unlink(path.join(dataRoot, ".data", "ngc-shop-board.json")).catch(() => undefined);
    resetSharedBoardDocumentCacheForTests();
    const { PUT } = await import("../app/api/board/route.ts");
    const body = {
      jobs: [seedJobs[1]],
      prefs: { hideClosed: true, timeframe: "" },
      dismissedJobNumbers: [],
      baseRevision: 0,
    };
    const created = await PUT(
      new Request("http://local/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(created.status, 200);
    const next = await PUT(
      new Request("http://local/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": "1" },
        body: JSON.stringify({
          ...body,
          jobs: [{ ...seedJobs[1], nextAction: "After backup" }],
          baseRevision: 1,
        }),
      }),
    );
    assert.equal(next.status, 200);
    const backups = await listFileBackups("ngc-shop-board");
    let foundPrior = false;
    for (const backup of backups) {
      const raw = JSON.parse(await readFile(path.join(dataRoot, ".data", backup), "utf8")) as {
        revision?: number;
        jobs?: { jobNumber?: string; nextAction?: string }[];
      };
      if (raw.revision === 1 && raw.jobs?.[0]?.jobNumber === seedJobs[1].jobNumber) {
        assert.notEqual(raw.jobs[0]?.nextAction, "After backup");
        foundPrior = true;
      }
    }
    assert.equal(foundPrior, true);
  });
});
