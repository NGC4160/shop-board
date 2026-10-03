"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast, Toaster } from "sonner";
import { Plus, X } from "lucide-react";
import {
  PART_STATUSES,
  customerNameError,
  isBlankPartDraft,
  partDescriptionError,
  sortParts,
  filterParts,
  type PartLine,
} from "@/lib/parts";
import {
  createDraftPart,
  deletePart,
  getPartsSnapshot,
  getServerPartsSnapshot,
  insertPart,
  reloadSharedParts,
  subscribeParts,
  undoDeletePart,
  updatePart,
} from "@/lib/parts-store";
import { BoardNav } from "@/components/shop/board-nav";
import { PartsTable } from "@/components/parts/parts-table";
import { usePullToRefresh } from "@/components/shop/use-pull-to-refresh";
import { useMobileViewportRestore } from "@/components/shop/use-mobile-viewport";

export function PartsApp() {
  const board = useSyncExternalStore(
    subscribeParts,
    getPartsSnapshot,
    getServerPartsSnapshot,
  );
  const [draft, setDraft] = useState<PartLine | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PartLine | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLElement>(null);
  useMobileViewportRestore(scrollRef);

  const runReload = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await reloadSharedParts();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadSharedParts();
    };
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reloadSharedParts();
    }, 12_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const { pull, armed } = usePullToRefresh(scrollRef, runReload, refreshing);

  const startDraft = useCallback(() => {
    if (draft) {
      toast.error("Fill customer and part on the new row");
      return;
    }
    setDraft(createDraftPart());
  }, [draft]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((event.key === "n" || event.key === "N") && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        startDraft();
      }
      if (event.key === "Escape" && pendingRemove) {
        event.preventDefault();
        setPendingRemove(null);
        return;
      }
      if (event.key === "Escape" && draft && isBlankPartDraft(draft)) {
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startDraft, draft, pendingRemove]);

  const visible = useMemo(
    () => sortParts(filterParts(board.parts, { status: statusFilter, search })),
    [board.parts, statusFilter, search],
  );

  const onChange = (id: string, patch: Partial<PartLine>) => {
    if (draft && id === draft.id) {
      const next = { ...draft, ...patch };
      if (!customerNameError(next.customerName) && !partDescriptionError(next.partDescription)) {
        const ok = insertPart(next);
        if (ok) setDraft(null);
        return ok;
      }
      setDraft(next);
      return true;
    }
    return updatePart(id, patch);
  };

  const refreshLabel = refreshing
    ? "Refreshing…"
    : armed
      ? "Release to refresh"
      : pull > 16
        ? "Pull to refresh"
        : `${board.parts.length} part${board.parts.length === 1 ? "" : "s"}`;

  return (
    <div className="shop-shell flex min-w-0 flex-col bg-background text-foreground">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-surface-2 text-foreground border border-border",
        }}
      />

      {draft ? (
        <div className="no-print shrink-0">
          <PartDraftComposer
            part={draft}
            onChange={onChange}
            onCancel={() => setDraft(null)}
          />
        </div>
      ) : null}

      <div
        className="board-refresh no-print parts-toolbar"
        data-refreshing={refreshing || undefined}
        style={{ height: "auto", minHeight: Math.max(40, refreshing ? 44 : pull) }}
      >
        <BoardNav current="parts" />
        <label className="parts-filter">
          <span className="sr-only">Filter by status</span>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="board-select h-8 rounded-sm border border-border bg-surface-3 px-2 text-sm font-semibold text-foreground"
          >
            <option value="all">All statuses</option>
            {PART_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Search customer or job"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Customer or job #"
          className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-sm text-foreground"
        />
        <p className="hidden min-w-0 truncate sm:block" role="status" aria-live="polite">
          {refreshLabel}
        </p>
        <button
          type="button"
          onClick={startDraft}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-border bg-surface-3 px-2.5 text-sm font-semibold text-accent hover:border-border-strong"
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </button>
      </div>

      <main ref={scrollRef} className="board-scroll min-h-0 min-w-0 flex-1">
        <p className="print-only mb-3 px-3 font-display text-2xl font-semibold">
          NGC Parts Board
        </p>
        <p className="sr-only">Parts spreadsheet · incoming parts and who they are for</p>

        {visible.length === 0 ? (
          <div className="m-3 rounded-lg border border-border bg-surface px-6 py-16 text-center">
            {board.parts.length > 0 ? (
              <>
                <p className="font-display text-2xl font-semibold">No parts match that filter</p>
                <p className="mt-2 text-sm text-muted">
                  Clear search or set status to All statuses to see every line.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                  className="mt-4 inline-flex h-11 items-center rounded-sm border border-border bg-surface-2 px-3 text-sm font-semibold"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-semibold">No parts on the board</p>
                <p className="mt-2 text-sm text-muted">
                  This is a shared list — not a per-phone copy. Add a line here, or have the Parts
                  process upsert by id. Press{" "}
                  <kbd className="rounded-sm border border-border px-1">N</kbd> to add one.
                </p>
              </>
            )}
          </div>
        ) : (
          <PartsTable parts={visible} onChange={onChange} onRemove={setPendingRemove} />
        )}
      </main>

      {pendingRemove ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={() => setPendingRemove(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-part-title"
            className="w-full max-w-md rounded-lg border border-border bg-surface-2 p-5 shadow-[var(--shadow-lift)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="remove-part-title" className="font-display text-2xl font-semibold">
              Remove from the parts board?
            </h2>
            <p className="mt-2 text-base text-muted">
              {pendingRemove.customerName || pendingRemove.partDescription || "This line"} leaves
              the shared parts list. Job cards are not changed.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPendingRemove(null)}
                className="inline-flex h-12 items-center justify-center rounded-sm border border-border text-base font-medium"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  const removed = pendingRemove;
                  deletePart(removed.id);
                  setPendingRemove(null);
                  toast(`Removed ${removed.customerName || "part"} from the parts board`, {
                    action: {
                      label: "Undo",
                      onClick: () => undoDeletePart(),
                    },
                  });
                }}
                className="inline-flex h-12 items-center justify-center rounded-sm bg-danger text-base font-semibold text-danger-fg"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PartDraftComposer({
  part,
  onChange,
  onCancel,
}: {
  part: PartLine;
  onChange: (id: string, patch: Partial<PartLine>) => boolean;
  onCancel: () => void;
}) {
  return (
    <div data-draft-composer className="border-b border-accent/40 bg-surface-2 px-2 py-2 sm:px-3">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="px-1 text-[10px] font-semibold tracking-wide text-muted uppercase sm:text-xs">
            New part · not on the board until customer and part
          </p>
          <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <input
              aria-label="Customer"
              autoFocus
              value={part.customerName}
              placeholder="Customer"
              onChange={(event) => onChange(part.id, { customerName: event.target.value })}
              className="h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-base font-semibold"
            />
            <input
              aria-label="Part description"
              value={part.partDescription}
              placeholder="Part"
              onChange={(event) => onChange(part.id, { partDescription: event.target.value })}
              className="h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-base"
            />
            <input
              aria-label="Job number"
              value={part.jobNumber}
              placeholder="Job # (if known)"
              onChange={(event) => onChange(part.id, { jobNumber: event.target.value })}
              className="h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 font-mono text-base"
            />
            <input
              aria-label="Vendor"
              value={part.vendor}
              placeholder="Vendor"
              onChange={(event) => onChange(part.id, { vendor: event.target.value })}
              className="h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-base"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border"
          title="Cancel new part"
        >
          <X className="size-4" />
          <span className="sr-only">Cancel new part</span>
        </button>
      </div>
    </div>
  );
}
