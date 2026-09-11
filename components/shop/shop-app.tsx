"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast, Toaster } from "sonner";
import {
  customerNameError,
  hasDuplicateJobNumber,
  isBlankIdentity,
  jobNumberError,
  normalizeJobNumber,
  type CartJob,
} from "@/lib/jobs";
import {
  createDraftJob,
  deleteJob,
  getBoardSnapshot,
  getServerBoardSnapshot,
  insertJob,
  subscribeBoard,
  undoDelete,
  updateJob,
} from "@/lib/board-store";
import { sortJobsByJobNumber } from "@/lib/sort";
import {
  refreshHcpJobs,
  startHcpMorningSync,
  type ClientHcpSyncResult,
} from "@/lib/hcp-client";
import { BoardTable, DraftComposer } from "@/components/shop/board-table";
import { RemoveConfirm } from "@/components/shop/remove-confirm";
import { usePullToRefresh } from "@/components/shop/use-pull-to-refresh";

export function ShopApp() {
  const board = useSyncExternalStore(
    subscribeBoard,
    getBoardSnapshot,
    getServerBoardSnapshot,
  );
  const [draft, setDraft] = useState<CartJob | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<CartJob | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

  const reportSync = useCallback((result: ClientHcpSyncResult, forced: boolean) => {
    if (!result.ok) {
      toast.error(result.error || "Housecall Pro sync failed");
      return;
    }
    if (result.skipped) {
      if (forced) {
        toast(result.reason || "Housecall Pro sync skipped");
      }
      return;
    }
    if (result.added || result.updated) {
      toast(`Housecall Pro · ${result.added} new, ${result.updated} updated`);
      return;
    }
    if (forced) toast("Housecall Pro · up to date");
  }, []);

  useEffect(() => {
    let errorToasted = false;
    return startHcpMorningSync((result: ClientHcpSyncResult) => {
      if (result.skipped) return;
      if (!result.ok && errorToasted) return;
      if (!result.ok) errorToasted = true;
      reportSync(result, false);
    });
  }, [reportSync]);

  const onPullRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshHcpJobs();
      reportSync(result, true);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, reportSync]);

  const { pull, armed } = usePullToRefresh(scrollRef, onPullRefresh, refreshing);

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
      if ((event.key === "n" || event.key === "N") && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        startDraft();
      }
      if (event.key === "Escape" && pendingRemove) {
        event.preventDefault();
        setPendingRemove(null);
        return;
      }
      if (event.key === "Escape" && draft && isBlankIdentity(draft)) {
        setDraft(null);
        setFocusId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startDraft, draft, pendingRemove]);

  useEffect(() => {
    const current = draft;
    if (!current || !isBlankIdentity(current)) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-draft-composer]")) return;
      abandonBlankDraft(current.id);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [draft, abandonBlankDraft]);

  const visible = useMemo(() => sortJobsByJobNumber(board.jobs), [board.jobs]);

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

  return (
    <div className="shop-shell flex flex-col bg-background text-foreground">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-surface-2 text-foreground border border-border",
        }}
      />

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

      <div
        className="board-refresh no-print"
        data-refreshing={refreshing || undefined}
        data-testid="hcp-refresh"
        aria-live="polite"
        style={{ height: refreshing ? 44 : pull }}
      >
        {refreshing ? "Syncing Housecall Pro…" : armed ? "Release to sync" : pull > 16 ? "Pull to sync" : null}
      </div>

      <main ref={scrollRef} className="board-scroll min-h-0 flex-1">
        <p className="print-only mb-3 px-3 font-display text-2xl font-semibold">
          NGC Shop Board
        </p>
        <p className="sr-only">Spreadsheet · sorted by job number</p>

        {visible.length === 0 ? (
          <div className="m-3 rounded-lg border border-border bg-surface px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold">No carts on the board</p>
            <p className="mt-2 text-sm text-muted">
              New carts come from Housecall Pro morning sync. Pull down to sync, or press{" "}
              <kbd className="rounded-sm border border-border px-1">N</kbd> to add one locally.
            </p>
          </div>
        ) : (
          <BoardTable
            jobs={visible}
            allJobs={board.jobs}
            onChange={onChange}
            onRemove={setPendingRemove}
            focusId={focusId}
          />
        )}
      </main>

      {pendingRemove ? (
        <RemoveConfirm
          job={pendingRemove}
          onKeep={() => setPendingRemove(null)}
          onRemove={() => {
            const removed = pendingRemove;
            deleteJob(removed.id);
            setPendingRemove(null);
            toast(`Removed ${removed.customerName || "job"} from the board`, {
              action: {
                label: "Undo",
                onClick: () => undoDelete(),
              },
            });
          }}
        />
      ) : null}
    </div>
  );
}
