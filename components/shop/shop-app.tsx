"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  PRIMARY_TECHS,
  isClosedStatus,
  type CartJob,
} from "@/lib/jobs";
import {
  addRow,
  advanceJob,
  deleteJob,
  exportBoardJson,
  getBoardSnapshot,
  getServerBoardSnapshot,
  importBoardJson,
  loadSampleBoard,
  savePrefs,
  saveSort,
  subscribeBoard,
  undoDelete,
  updateJob,
} from "@/lib/board-store";
import { CHIP_FILTERS, CHIP_LABELS, boardStats, countChip, jobMatches, type ChipFilter } from "@/lib/filters";
import { setStatusSortMode, sortJobsBy, toggleSort, type SortColumn, type StatusSortMode } from "@/lib/sort";
import { CartMark } from "@/components/shop/cart-mark";
import {
  BoardCards,
  BoardTable,
  MobileSortBar,
  QueueBoard,
} from "@/components/shop/board-table";
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
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
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
        const id = addRow();
        setOpenId(id);
        toast("Blank row added");
      }
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = { search, tech, chip, hideClosed: board.prefs.hideClosed };
  const visible = useMemo(
    () => sortJobsBy(board.jobs.filter((job) => jobMatches(job, query, now)), board.sort),
    [board.jobs, board.sort, search, tech, chip, board.prefs.hideClosed, now],
  );
  const stats = useMemo(() => boardStats(board.jobs, now), [board.jobs, now]);
  const openJob = board.jobs.find((job) => job.id === openId) ?? null;

  const onChange = (id: string, patch: Partial<CartJob>) => updateJob(id, patch);

  const onDelete = (id: string) => {
    if (openId === id) setOpenId(null);
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
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-surface-2 text-foreground border border-border",
        }}
      />
      <header className="no-print border-b border-border bg-surface px-3 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <CartMark className="mt-1 size-9 text-accent" />
            <div>
              <p className="font-display text-xs font-semibold tracking-[0.2em] text-accent uppercase">
                Covington, LA
              </p>
              <h1 className="mt-0.5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Shop Board
              </h1>
              <p className="mt-1 text-sm text-muted">
                Neighborhood Golf Carts · Housecall Pro jobs on the floor
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 font-display text-2xl font-semibold tabular-nums tracking-tight">
              {formatClock(now)}
            </p>
            <button
              type="button"
              onClick={() => {
                const id = addRow();
                setOpenId(id);
                toast("Blank row added");
              }}
              className="inline-flex h-11 items-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold text-accent-ink"
            >
              <Plus className="size-4" />
              Add cart
            </button>
            <Link
              href="/wall"
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-border px-3 text-sm font-medium"
            >
              <Monitor className="size-4" />
              Wall
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-3"
              title="Print"
            >
              <Printer className="size-4" />
              <span className="sr-only">Print</span>
            </button>
            <button
              type="button"
              onClick={exportBoard}
              className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-3"
              title="Export"
            >
              <Download className="size-4" />
              <span className="sr-only">Export</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-3"
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
              className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-3"
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
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Open" value={stats.open} />
          <Stat label="Hot" value={stats.hot} warn={stats.hot > 0} />
          <Stat label="Due today" value={stats.due} warn={stats.due > 0} />
          <Stat label="Parts" value={stats.parts} />
          <Stat label="Unassigned" value={stats.unassigned} />
          <Stat label="Stuck 3+ days" value={stats.stale} warn={stats.stale > 0} />
        </dl>
      </header>

      <div className="no-print border-b border-border bg-surface px-3 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, job #, cart, notes"
              className="h-11 w-full rounded-sm border border-border bg-background pr-3 pl-10 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by tech"
              value={tech}
              onChange={(event) => setTech(event.target.value)}
              className="h-11 rounded-sm border border-border bg-background px-3 text-sm"
            >
              <option value="">All techs</option>
              <option value="__none__">Unassigned</option>
              {PRIMARY_TECHS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="flex rounded-sm border border-border p-0.5">
              <button
                type="button"
                onClick={() => savePrefs({ view: "floor" })}
                className={cn(
                  "h-10 rounded-[6px] px-3 text-sm font-medium",
                  board.prefs.view === "floor" ? "bg-surface-3" : "text-muted",
                )}
              >
                Floor
              </button>
              <button
                type="button"
                onClick={() => savePrefs({ view: "queue" })}
                className={cn(
                  "h-10 rounded-[6px] px-3 text-sm font-medium",
                  board.prefs.view === "queue" ? "bg-surface-3" : "text-muted",
                )}
              >
                Queue
              </button>
            </div>
            <label className="inline-flex h-11 items-center gap-2 rounded-sm border border-border px-3 text-sm">
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
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
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

      <main className="flex-1 px-2 py-3 sm:px-4">
        <p className="print-only mb-3 font-display text-2xl font-semibold">
          NGC Shop Board · {formatClock(now)}
        </p>
        {board.prefs.view === "floor" ? (
          <MobileSortBar
            sort={board.sort}
            onSort={(column: SortColumn) => saveSort(toggleSort(board.sort, column))}
            onStatusMode={(mode: StatusSortMode) => saveSort(setStatusSortMode(board.sort, mode))}
          />
        ) : null}

        {visible.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold">No carts match</p>
            <p className="mt-2 text-sm text-muted">
              {board.jobs.length === 0
                ? "Use Add cart to start the board."
                : "Clear the search or pick another filter."}
            </p>
          </div>
        ) : board.prefs.view === "queue" ? (
          <>
            <QueueBoard jobs={visible} onOpen={setOpenId} />
            <BoardCards
              jobs={visible}
              allJobs={board.jobs}
              onChange={onChange}
              onAdvance={onAdvance}
              onDelete={onDelete}
              onOpen={setOpenId}
            />
          </>
        ) : (
          <>
            <BoardTable
              jobs={visible}
              allJobs={board.jobs}
              sort={board.sort}
              onSort={(column) => saveSort(toggleSort(board.sort, column))}
              onStatusMode={(mode) => saveSort(setStatusSortMode(board.sort, mode))}
              onChange={onChange}
              onAdvance={onAdvance}
              onDelete={onDelete}
              onOpen={setOpenId}
            />
            <BoardCards
              jobs={visible}
              allJobs={board.jobs}
              onChange={onChange}
              onAdvance={onAdvance}
              onDelete={onDelete}
              onOpen={setOpenId}
            />
          </>
        )}
        <p className="no-print mt-4 text-sm text-subtle">
          {visible.filter((job) => !isClosedStatus(job.status)).length} showing · {stats.open} open ·{" "}
          {stats.total} total · Press <kbd className="rounded-sm border border-border px-1">N</kbd> to
          add · <kbd className="rounded-sm border border-border px-1">/</kbd> to search
        </p>
      </main>

      <JobDrawer
        job={openJob}
        onClose={() => setOpenId(null)}
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
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd
        className={cn(
          "font-display text-2xl font-semibold tabular-nums tracking-tight",
          warn && value > 0 ? "text-danger" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
