import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { SAMPLE_PART_LINE, emptyPartLine } from "./parts.ts";
import { seedJobs } from "./jobs.ts";
import {
  applyIncomingPartsPut,
  emptySharedPartsDocument,
  toSharedPartsDocument,
} from "./parts-board.ts";
import {
  applySharedPartsSnapshot,
  deletePart,
  exportSharedPartsPayload,
  flushSharedPartsPush,
  getPartsSnapshot,
  hydrateSharedParts,
  insertPart,
  reloadSharedParts,
  replaceParts,
  resetPartsStoreForTests,
  undoDeletePart,
  updatePart,
} from "./parts-store.ts";
import { getBoardSnapshot, loadSampleBoard } from "./board-store.ts";

describe("parts store isolation", () => {
  it("exports parts only — never jobs", () => {
    replaceParts([SAMPLE_PART_LINE]);
    const payload = exportSharedPartsPayload();
    assert.equal(payload.parts.length, 1);
    assert.equal("jobs" in payload, false);
    assert.equal(Array.isArray(payload.parts), true);
  });

  it("does not change job cards when a part is edited", () => {
    loadSampleBoard();
    const jobsBefore = getBoardSnapshot().jobs.map((job) => ({ ...job }));
    replaceParts([SAMPLE_PART_LINE]);
    assert.equal(updatePart("sample-demo-part", { status: "Received", note: "On the shelf" }), true);
    assert.equal(
      getPartsSnapshot().parts.find((part) => part.id === "sample-demo-part")?.status,
      "Received",
    );
    assert.equal(updatePart("sample-demo-part", { status: "Checked in" }), true);
    assert.equal(
      getPartsSnapshot().parts.find((part) => part.id === "sample-demo-part")?.status,
      "Checked in",
    );
    assert.equal(getPartsSnapshot().parts.length, 1);
    assert.deepEqual(
      getBoardSnapshot().jobs.map((job) => job.id),
      jobsBefore.map((job) => job.id),
    );
    assert.deepEqual(
      getBoardSnapshot().jobs.map((job) => job.customerName),
      jobsBefore.map((job) => job.customerName),
    );
    assert.equal(getBoardSnapshot().jobs.length, seedJobs.length);
  });

  it("inserts only after customer and part description are present", () => {
    replaceParts([]);
    assert.equal(insertPart(emptyPartLine("draft-1")), false);
    assert.equal(getPartsSnapshot().parts.length, 0);
    assert.equal(
      insertPart({
        ...emptyPartLine("draft-1"),
        customerName: "SAMPLE Customer",
        partDescription: "Example battery",
      }),
      true,
    );
    assert.equal(getPartsSnapshot().parts.length, 1);
  });

  it("can remove a row and undo", () => {
    replaceParts([SAMPLE_PART_LINE]);
    assert.equal(deletePart("sample-demo-part"), true);
    assert.equal(getPartsSnapshot().parts.length, 0);
    assert.equal(undoDeletePart(), true);
    assert.equal(getPartsSnapshot().parts[0]?.id, "sample-demo-part");
  });

  it("applies a shared snapshot without seeding fake customers", () => {
    replaceParts([SAMPLE_PART_LINE]);
    applySharedPartsSnapshot({ parts: [] });
    assert.equal(getPartsSnapshot().parts.length, 0);
  });
});

describe("parts page refresh and stale save", () => {
  const originalFetch = globalThis.fetch;
  const globalWithWindow = globalThis as typeof globalThis & { window?: typeof globalThis };
  const previousWindow = globalWithWindow.window;
  let serverDoc = emptySharedPartsDocument(1_000);
  const puts: unknown[] = [];

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  before(() => {
    globalWithWindow.window = globalThis;
  });

  after(() => {
    if (previousWindow === undefined) delete globalWithWindow.window;
    else globalWithWindow.window = previousWindow;
    globalThis.fetch = originalFetch;
    resetPartsStoreForTests();
  });

  beforeEach(() => {
    resetPartsStoreForTests();
    puts.length = 0;
    serverDoc = emptySharedPartsDocument(1_000);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetPartsStoreForTests();
    puts.length = 0;
    serverDoc = emptySharedPartsDocument(1_000);
  });

  function installFetch() {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body ?? "{}")) as unknown;
        puts.push(body);
        const result = applyIncomingPartsPut(serverDoc, body, Date.now());
        if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
        serverDoc = result.doc;
        return jsonResponse({ ok: true, empty: false, configured: true, wrote: true, ...serverDoc });
      }
      return jsonResponse({
        ok: true,
        empty: serverDoc.parts.length === 0,
        configured: true,
        ...serverDoc,
      });
    }) as typeof fetch;
  }

  it("does not PUT when an idle page reloads", async () => {
    serverDoc = toSharedPartsDocument({ parts: [SAMPLE_PART_LINE] }, 1_000);
    installFetch();
    await hydrateSharedParts();
    assert.equal(getPartsSnapshot().parts.length, 1);
    assert.equal(puts.length, 0);
    await reloadSharedParts();
    await reloadSharedParts();
    await flushSharedPartsPush();
    assert.equal(puts.length, 0);
  });

  it("keeps a POST made while the page is open on the next refresh", async () => {
    const existing = { ...SAMPLE_PART_LINE, id: "already-on-board", updatedAt: 1_000 };
    const posted = {
      ...SAMPLE_PART_LINE,
      id: "bot-added-while-open",
      customerName: "SAMPLE Posted",
      partDescription: "Example cable added by the bot",
      updatedAt: 2_000,
    };
    serverDoc = toSharedPartsDocument({ parts: [existing] }, 1_000);
    installFetch();
    await hydrateSharedParts();
    assert.equal(getPartsSnapshot().parts.length, 1);

    serverDoc = toSharedPartsDocument({ parts: [existing, posted] }, 2_000);
    await reloadSharedParts();

    assert.equal(puts.length, 0);
    assert.equal(
      getPartsSnapshot().parts.some((line) => line.id === "bot-added-while-open"),
      true,
    );
    assert.equal(getPartsSnapshot().parts.length, 2);
  });

  it("does not drop newer lines when a stale page saves an edit", async () => {
    const existing = { ...SAMPLE_PART_LINE, id: "already-on-board", updatedAt: 1_000 };
    const posted = {
      ...SAMPLE_PART_LINE,
      id: "bot-added-while-open",
      customerName: "SAMPLE Posted",
      partDescription: "Example cable added by the bot",
      updatedAt: 2_000,
    };
    serverDoc = toSharedPartsDocument({ parts: [existing] }, 1_000);
    installFetch();
    await hydrateSharedParts();

    serverDoc = toSharedPartsDocument({ parts: [existing, posted] }, 2_000);
    assert.equal(updatePart("already-on-board", { note: "On the shelf" }), true);
    await flushSharedPartsPush();

    assert.equal(puts.length, 1);
    const sent = puts[0] as { updatedAt?: number; parts?: { id: string }[] };
    assert.equal(sent.updatedAt, 1_000);
    assert.equal(sent.parts?.some((line) => line.id === "bot-added-while-open"), false);
    assert.equal(serverDoc.parts.some((line) => line.id === "bot-added-while-open"), true);
    assert.equal(
      getPartsSnapshot().parts.find((line) => line.id === "already-on-board")?.note,
      "On the shelf",
    );
    assert.equal(
      getPartsSnapshot().parts.some((line) => line.id === "bot-added-while-open"),
      true,
    );
  });
});
