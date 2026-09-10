"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Download,
  Monitor,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Upload,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  customerNameError,
  hasDuplicateJobNumber,
  isBlankIdentity,
  jobNumberError,
  normalizeJobNumber,
  PRIMARY_TECHS,
  isClosedStatus,
  type CartJob,
} from "@/lib/jobs";
import {
  createDraftJob,
  advanceJob,
  deleteJob,
  exportBoardJson,
  getBoardSnapshot,
  getServerBoardSnapshot,
  importBoardJson,
  insertJob,
  loadSampleBoard,
  savePrefs,
  subscribeBoard,
  undoDelete,
  updateJob,
} from "@/lib/board-store";
import { CHIP_FILTERS, CHIP_LABELS, boardStats, countChip, jobMatches, type ChipFilter } from "@/lib/filters";
import { sortJobsByJobNumber } from "@/lib/sort";
import { startHcpMorningSync, type ClientHcpSyncResult } from "@/lib/hcp-client";
import { CartMark } from "@/components/shop/cart-mark";
import { BoardTable, DraftComposer } from "@/components/shop/board-table";
import { JobDrawer } from "@/components/shop/job-drawer";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ShopApp() {
  const board = useSyncExternalStore(
    subscribeBoard,
    getBoardSnapshot,
    getServerBoardSnapshot,
  );
  const [search, setSearch] = useState("");
  const [tech, setTech] = useState("");
  const [chip, setChip] = useState<ChipFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CartJob | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let errorToasted = false;
    return startHcpMorningSync((result: ClientHcpSyncResult) => {
      if (result.skipped) return;
      if (!result.ok) {
        if (!errorToasted) {
          errorToasted = true;
          toast.error(result.error || "Housecall Pro sync failed");
        }
        return;
      }
      if (result.added || result.updated) {
        toast(`Housecall Pro · ${result.added} new, ${result.updated} updated`);
      }
    });
  }, []);

  const startDraft = useCallback(() => {
    if (draft) {
      toast.error("Fill customer name and job # on the new row");
      setFocusId(draft.id);
      return;
    }
    const job = createDraftJob();
    setDraft(job);
    setFocusId(job.id);
  }, [draft]);

  const abandonBlankDraft = useCallback((id: string) => {
    setDraft((current) => {
      if (!current || current.id !== id || !isBlankIdentity(current)) return current;
      return null;
    });
    setFocusId((focus) => (focus === id ? null : focus));
    setOpenId((open) => (open === id ? null : open));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.key === "n" || event.key === "N") && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        startDraft();
      }
      if (event.key === "Escape") {
        setOpenId(null);
        if (draft && isBlankIdentity(draft)) {
          setDraft(null);
          setFocusId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startDraft, draft]);

  useEffect(() => {
    const current = draft;
    if (!current || !isBlankIdentity(current)) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-draft-composer], [data-add-cart]")) return;
      abandonBlankDraft(current.id);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [draft, abandonBlankDraft]);

  const visible = useMemo(
    () =>
      sortJobsByJobNumber(
        board.jobs.filter((job) =>
          jobMatches(job, { search, tech, chip, hideClosed: board.prefs.hideClosed }, now),
        ),
      ),
    [board.jobs, search, tech, chip, board.prefs.hideClosed, now],
  );
  const stats = useMemo(() => boardStats(board.jobs, now), [board.jobs, now]);
  const openJob =
    board.jobs.find((job) => job.id === openId) ??
    (draft && draft.id === openId ? draft : null);

  const onChange = (id: string, patch: Partial<CartJob>) => {
    if (draft && id === draft.id) {
      if (patch.customerName !== undefined && customerNameError(patch.customerName)) {
        return false;
      }
      if (patch.jobNumber !== undefined) {
        if (jobNumberError(patch.jobNumber)) return false;
        if (hasDuplicateJobNumber(board.jobs, id, patch.jobNumber)) return false;
      }
      const next: CartJob = {
        ...draft,
        ...patch,
        customerName:
          patch.customerName !== undefined ? patch.customerName.trim() : draft.customerName,
        jobNumber:
          patch.jobNumber !== undefined ? normalizeJobNumber(patch.jobNumber) : draft.jobNumber,
      };
      if (
        !customerNameError(next.customerName) &&
        !jobNumberError(next.jobNumber) &&
        !hasDuplicateJobNumber(board.jobs, next.id, next.jobNumber)
      ) {
        const ok = insertJob(next);
        if (ok) {
          setDraft(null);
          setFocusId(null);
        }
        return ok;
      }
      setDraft(next);
      return true;
    }
    return updateJob(id, patch);
  };

  const onDelete = (id: string) => {
    if (openId === id) setOpenId(null);
    if (draft && id === draft.id) {
      setDraft(null);
      setFocusId(null);
      toast("Cart removed");
      return;
    }
    deleteJob(id);
    toast("Cart removed", {
      action: {
        label: "Undo",
        onClick: () => {
          undoDelete();
        },
      },
    });
  };

  const onAdvance = (id: string) => {
    const next = advanceJob(id);
    if (next) toast(`Moved to ${next}`);
  };

  const exportBoard = () => {
    const blob = new Blob([exportBoardJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ngc-shop-board-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Board exported");
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const result = importBoardJson(text);
    if (result.ok) toast(`Imported ${result.count} carts`);
    else toast.error(result.error);
  };

  return (
    <div className="shop-shell flex flex-col bg-background text-foreground">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-surface-2 text-foreground border border-border",
        }}
      />
      <header className="no-print shrink-0 border-b border-border bg-surface px-2 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <CartMark className="size-7 shrink-0 text-accent sm:size-8" />
          <div className="min-w-0 flex-1">
            <p className="hidden font-display text-xs font-semibold tracking-[0.2em] text-accent uppercase sm:block">
              Covington, LA
            </p>
            <h1 className="font-display text-xl leading-none font-semibold tracking-tight sm:text-3xl">
              Shop Board
            </h1>
          </div>
          <p className="font-display text-lg font-semibold tabular-nums tracking-tight sm:text-2xl">
            {formatClock(now)}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => startDraft()}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm bg-accent px-3 text-sm font-semibold text-accent-ink sm:px-4"
            data-add-cart
          >
            <Plus className="size-4" />
            Add cart
          </button>
          <Link
            href="/wall"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border sm:w-auto sm:gap-2 sm:px-3"
          >
            <Monitor className="size-4" />
            <span className="sr-only sm:not-sr-only sm:text-sm sm:font-medium">Wall</span>
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
            title="Print"
          >
            <Printer className="size-4" />
            <span className="sr-only">Print</span>
          </button>
          <button
            type="button"
            onClick={exportBoard}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
            title="Export"
          >
            <Download className="size-4" />
            <span className="sr-only">Export</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
            title="Import"
          >
            <Upload className="size-4" />
            <span className="sr-only">Import</span>
          </button>
          <button
            type="button"
            onClick={() => {
              loadSampleBoard();
              toast("Sample board loaded");
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
            title="Load sample board"
          >
            <RotateCcw className="size-4" />
            <span className="sr-only">Load sample board</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
              event.target.value = "";
            }}
          />
        </div>

        <dl className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6 sm:gap-2">
          <Stat label="Open" value={stats.open} />
          <Stat label="Hot" value={stats.hot} warn={stats.hot > 0} />
          <Stat label="Due today" value={stats.due} warn={stats.due > 0} />
          <Stat label="Parts" value={stats.parts} />
          <Stat label="Unassigned" value={stats.unassigned} />
          <Stat label="Stuck 3+ days" value={stats.stale} warn={stats.stale > 0} />
        </dl>
      </header>

      <div className="no-print shrink-0 border-b border-border bg-surface px-2 py-2 sm:px-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, job #, cart, notes"
              className="h-11 w-full rounded-sm border border-border bg-background pr-3 pl-10 text-base md:text-sm"
            />
          </label>
          <div className="flex items-center gap-2 overflow-x-auto">
            <select
              aria-label="Filter by tech"
              value={tech}
              onChange={(event) => setTech(event.target.value)}
              className="h-11 min-w-36 rounded-sm border border-border bg-background px-3 text-base md:text-sm"
            >
              <option value="">All techs</option>
              <option value="__none__">Unassigned</option>
              {PRIMARY_TECHS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <label className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm border border-border px-3 text-sm">
              <input
                type="checkbox"
                checked={board.prefs.hideClosed}
                onChange={(event) => savePrefs({ hideClosed: event.target.checked })}
                className="size-4 accent-accent"
              />
              Hide closed
            </label>
          </div>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {CHIP_FILTERS.map((item) => {
            const count = countChip(board.jobs, item, now);
            return (
              <button
                key={item}
                type="button"
                onClick={() => setChip(item)}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-sm border px-3 text-sm",
                  chip === item
                    ? "border-accent bg-chip-bay text-chip-bay-fg"
                    : "border-border text-muted",
                )}
              >
                {CHIP_LABELS[item]}
                <span className="font-mono text-xs tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {draft ? (
        <div className="no-print shrink-0">
          <DraftComposer
            job={draft}
            jobs={board.jobs}
            onChange={onChange}
            onCancel={() => {
              setDraft(null);
              setFocusId(null);
            }}
          />
        </div>
      ) : null}

      <main className="board-scroll min-h-0 flex-1">
        <p className="print-only mb-3 px-3 font-display text-2xl font-semibold">
          NGC Shop Board · {formatClock(now)}
        </p>
        <p className="sr-only">Spreadsheet · sorted by job number</p>

        {visible.length === 0 ? (
          <div className="m-3 rounded-lg border border-border bg-surface px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold">No carts match</p>
            <p className="mt-2 text-sm text-muted">
              {board.jobs.length === 0 && !draft
                ? "Use Add cart to start the board."
                : "Clear the search or pick another filter."}
            </p>
          </div>
        ) : (
          <BoardTable
            jobs={visible}
            allJobs={board.jobs}
            onChange={onChange}
            onAdvance={onAdvance}
            onDelete={onDelete}
            onOpen={setOpenId}
            focusId={focusId}
          />
        )}
        <p className="no-print hidden px-3 py-2 text-sm text-subtle sm:block">
          {visible.filter((job) => !isClosedStatus(job.status)).length} showing · {stats.open} open ·{" "}
          {stats.total} total · Press <kbd className="rounded-sm border border-border px-1">N</kbd> to
          add · <kbd className="rounded-sm border border-border px-1">/</kbd> to search
        </p>
      </main>

      <JobDrawer
        job={openJob}
        onClose={() => {
          setOpenId(null);
        }}
        onChange={onChange}
        onAdvance={onAdvance}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1 sm:px-3 sm:py-2">
      <dt className="text-[10px] leading-tight font-semibold tracking-wide text-muted uppercase sm:text-xs">
        {label}
      </dt>
      <dd
        className={cn(
          "font-display text-lg leading-tight font-semibold tabular-nums tracking-tight sm:text-2xl",
          warn && value > 0 ? "text-danger" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
