import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAMPLE_PART_LINE,
  filterParts,
  inferCarrier,
  mergePartLine,
  partIdError,
  parsePartIdInput,
  removePartLine,
  sanitizeLoadedParts,
  sanitizePartLine,
  sortParts,
  trackingUrl,
  upsertPartLine,
} from "./parts.ts";

describe("sanitize and upsert", () => {
  it("requires a stable id and ignores a jobs field on a line", () => {
    assert.equal(sanitizePartLine({ customerName: "Nope" }), null);
    assert.equal(partIdError(""), "Part id is required");
    const line = sanitizePartLine({
      id: "po-1",
      customerName: "SAMPLE Customer",
      jobNumber: "SAMPLE",
      partDescription: "Example cable",
      status: "Shipped",
      jobs: [{ id: "should-not-become-a-job" }],
    });
    assert.ok(line);
    assert.equal(line.id, "po-1");
    assert.equal(line.status, "Shipped");
    assert.equal("jobs" in line, false);
  });

  it("upserts by id without inventing a second row", () => {
    const first = upsertPartLine([], {
      id: "line-1",
      customerName: "SAMPLE Customer",
      partDescription: "Example solenoid",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = upsertPartLine(first.parts, {
      id: "line-1",
      status: "Shipped",
      carrier: "ups",
      trackingNumber: "1Z999AA10123456784",
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.parts.length, 1);
    assert.equal(second.line.customerName, "SAMPLE Customer");
    assert.equal(second.line.status, "Shipped");
    assert.equal(second.line.carrier, "UPS");
    assert.equal(second.line.trackingNumber, "1Z999AA10123456784");
  });

  it("removes one line by id and leaves the rest", () => {
    const first = upsertPartLine([], {
      id: "line-keep",
      customerName: "SAMPLE Keep",
      partDescription: "Example solenoid",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = upsertPartLine(first.parts, {
      id: "line-drop",
      customerName: "SAMPLE Drop",
      partDescription: "Example charger",
      status: "Received",
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const removed = removePartLine(second.parts, { id: "line-drop" });
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(removed.removed.id, "line-drop");
    assert.equal(removed.parts.length, 1);
    assert.equal(removed.parts[0]?.id, "line-keep");
    assert.equal(removed.parts[0]?.customerName, "SAMPLE Keep");
    assert.equal(removePartLine(removed.parts, "line-drop").ok, false);
    assert.equal(parsePartIdInput("").ok, false);
    assert.equal(parsePartIdInput({ id: "has space" }).ok, false);
    assert.equal(parsePartIdInput({ id: "line-keep" }).ok, true);
  });

  it("drops unknown statuses and leftover expected-date phrases", () => {
    const line = mergePartLine(SAMPLE_PART_LINE, {
      status: "Overnighted" as never,
      expectedDate: "this week",
      note: "  short note  ",
    });
    assert.equal(line.status, "Ordered");
    assert.equal(line.expectedDate, "");
    assert.equal(line.note, "short note");
  });

  it("keeps only the first copy of a duplicate id", () => {
    const parts = sanitizeLoadedParts([
      { ...SAMPLE_PART_LINE, id: "dup" },
      { ...SAMPLE_PART_LINE, id: "dup", customerName: "Other" },
      { customerName: "Missing id" },
    ]);
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.customerName, "SAMPLE Customer");
  });
});

describe("tracking links", () => {
  it("links USPS, UPS, and FedEx when a number is present", () => {
    assert.equal(
      trackingUrl("USPS", "9400111899223456789012"),
      "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223456789012",
    );
    assert.equal(
      trackingUrl("UPS", "1Z999AA10123456784"),
      "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    );
    assert.equal(
      trackingUrl("FedEx", "123456789012"),
      "https://www.fedex.com/fedextrack/?trknbr=123456789012",
    );
    assert.equal(trackingUrl("UPS", ""), null);
    assert.equal(inferCarrier("1Z999AA10123456784"), "UPS");
    assert.equal(inferCarrier("9400111899223456789012"), "USPS");
    assert.equal(inferCarrier("123456789012"), "FedEx");
    assert.equal(trackingUrl("", "1Z999AA10123456784")?.includes("ups.com"), true);
  });
});

describe("filter, search, and sort", () => {
  const rows = [
    { ...SAMPLE_PART_LINE, id: "a", customerName: "SAMPLE Alpha", jobNumber: "S-1", status: "Received" as const, expectedDate: "2026-10-01" },
    { ...SAMPLE_PART_LINE, id: "b", customerName: "SAMPLE Beta", jobNumber: "S-2", status: "Shipped" as const, expectedDate: "2026-10-08" },
    { ...SAMPLE_PART_LINE, id: "c", customerName: "SAMPLE Gamma", jobNumber: "S-9", status: "Problem" as const, expectedDate: "" },
  ];

  it("filters by status and searches customer or job", () => {
    assert.equal(filterParts(rows, { status: "Shipped", search: "" }).length, 1);
    assert.equal(filterParts(rows, { status: "all", search: "beta" })[0]?.id, "b");
    assert.equal(filterParts(rows, { status: "", search: "s-9" })[0]?.id, "c");
    assert.equal(filterParts(rows, { status: "Ordered", search: "beta" }).length, 0);
  });

  it("sorts incoming work before received, then by expected date", () => {
    const sorted = sortParts(rows);
    assert.deepEqual(sorted.map((row) => row.id), ["b", "c", "a"]);
  });
});
