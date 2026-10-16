import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import { SAMPLE_PART_LINE } from "./parts.ts";
import { resolveBaseRevision, readStoredRevision } from "./revision.ts";
import { threeWayMergeById } from "./document-merge.ts";
import { resetSharedBoardDocumentCacheForTests } from "./shared-board-backend.ts";
import { resetSharedPartsDocumentCacheForTests } from "./parts-board-backend.ts";

const job = () => structuredClone(seedJobs[0]);

function putRequest(url: string, body: unknown, ifMatch?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (ifMatch != null) headers.set("If-Match", ifMatch);
  return new Request(url, { method: "PUT", headers, body: JSON.stringify(body) });
}

describe("revision header", () => {
  it("reads a legacy document as revision 0", () => {
    assert.equal(readStoredRevision({ jobs: [] }), 0);
    assert.equal(readStoredRevision({ revision: 4 }), 4);
    assert.equal(readStoredRevision({ revision: 1.5 }), 0);
  });

  it("accepts If-Match or baseRevision and rejects a mismatch", () => {
    assert.equal(resolveBaseRevision({ baseRevision: 3 }, null).ok, true);
    assert.deepEqual(resolveBaseRevision({}, '"3"'), { ok: true, revision: 3 });
    assert.deepEqual(resolveBaseRevision({ baseRevision: 3 }, "3"), { ok: true, revision: 3 });
    const mismatch = resolveBaseRevision({ baseRevision: 2 }, "3");
    assert.equal(mismatch.ok, false);
    const missing = resolveBaseRevision({ jobs: [] }, null);
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.error, /baseRevision/);
  });
});

describe("three-way merge keeps both sides", () => {
  it("keeps a server-only line and a local edit", () => {
    const base = [{ id: "a", note: "old", updatedAt: 1 }];
    const local = [{ id: "a", note: "shelf", updatedAt: 3 }];
    const server = [
      { id: "a", note: "old", updatedAt: 1 },
      { id: "b", note: "bot", updatedAt: 2 },
    ];
    const merged = threeWayMergeById(base, local, server);
    assert.deepEqual(
      merged.items.map((item) => item.id).sort(),
      ["a", "b"],
    );
    assert.equal(merged.items.find((item) => item.id === "a")?.note, "shelf");
    assert.equal(merged.conflicts, 0);
  });
});

describe("PUT /api/board revision", () => {
  const originalCwd = process.cwd();
  let dataRoot = "";

  before(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ngc-board-"));
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

  it("returns 409 with the current document when the base revision is stale", async () => {
    const { PUT } = await import("../app/api/board/route.ts");
    const firstBody = {
      jobs: [job()],
      prefs: { hideClosed: true, timeframe: "" },
      dismissedJobNumbers: [],
      baseRevision: 0,
    };
    const created = await PUT(putRequest("http://local/api/board", firstBody));
    assert.equal(created.status, 200);
    const createdJson = (await created.json()) as { revision: number; jobs: { jobNumber: string }[] };
    assert.equal(createdJson.revision, 1);

    const stale = await PUT(
      putRequest("http://local/api/board", {
        ...firstBody,
        jobs: [{ ...job(), nextAction: "stale overwrite" }],
        baseRevision: 0,
      }),
    );
    assert.equal(stale.status, 409);
    const staleJson = (await stale.json()) as {
      conflict: boolean;
      revision: number;
      jobs: { nextAction: string }[];
      error: string;
    };
    assert.equal(staleJson.conflict, true);
    assert.equal(staleJson.revision, 1);
    assert.equal(staleJson.jobs[0]?.nextAction, job().nextAction);
    assert.match(staleJson.error, /another device/);

    const saved = await PUT(
      putRequest(
        "http://local/api/board",
        {
          ...firstBody,
          jobs: [{ ...job(), nextAction: "Call Jesse" }],
          baseRevision: 1,
        },
        "1",
      ),
    );
    assert.equal(saved.status, 200);
    const savedJson = (await saved.json()) as { revision: number; jobs: { nextAction: string }[] };
    assert.equal(savedJson.revision, 2);
    assert.equal(savedJson.jobs[0]?.nextAction, "Call Jesse");
  });

  it("rejects a malformed row with 400 before checking the revision", async () => {
    const { PUT } = await import("../app/api/board/route.ts");
    const response = await PUT(
      putRequest("http://local/api/board", {
        jobs: [{ ...job(), jobNumber: "ABC" }],
        prefs: { hideClosed: true, timeframe: "" },
        dismissedJobNumbers: [],
        baseRevision: 2,
      }),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Job 1/);
    assert.match(body.error, /digits/);
  });
});

describe("PUT /api/parts revision", () => {
  const originalCwd = process.cwd();
  let dataRoot = "";

  before(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ngc-parts-"));
    process.chdir(dataRoot);
    process.env.PARTS_WRITE_TOKEN = "test-token";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    resetSharedPartsDocumentCacheForTests();
  });

  after(async () => {
    delete process.env.PARTS_WRITE_TOKEN;
    process.chdir(originalCwd);
    resetSharedPartsDocumentCacheForTests();
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("keeps a token POST when a stale PUT is rejected", async () => {
    const { POST, PUT } = await import("../app/api/parts/route.ts");
    const created = await PUT(
      putRequest("http://local/api/parts", {
        parts: [SAMPLE_PART_LINE],
        baseRevision: 0,
      }),
    );
    assert.equal(created.status, 200);
    const createdJson = (await created.json()) as { revision: number };
    assert.equal(createdJson.revision, 1);

    const posted = await POST(
      new Request("http://local/api/parts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          id: "po-1001-line-1",
          customerName: "SAMPLE Posted",
          partDescription: "Example cable",
          status: "Shipped",
        }),
      }),
    );
    assert.equal(posted.status, 200);
    const postedJson = (await posted.json()) as { revision: number; parts: { id: string }[] };
    assert.equal(postedJson.revision, 2);
    assert.equal(postedJson.parts.some((line) => line.id === "po-1001-line-1"), true);

    const stale = await PUT(
      putRequest("http://local/api/parts", {
        parts: [SAMPLE_PART_LINE],
        baseRevision: 1,
      }),
    );
    assert.equal(stale.status, 409);
    const staleJson = (await stale.json()) as { revision: number; parts: { id: string }[] };
    assert.equal(staleJson.revision, 2);
    assert.equal(staleJson.parts.some((line) => line.id === "po-1001-line-1"), true);
    assert.equal(staleJson.parts.some((line) => line.id === SAMPLE_PART_LINE.id), true);
  });
});
