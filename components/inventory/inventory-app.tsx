"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import {
  activeInventory,
  formatInventoryMoney,
  inventoryBalance,
  type InventoryItem,
} from "@/lib/inventory";
import {
  getInventorySnapshot,
  getServerInventorySnapshot,
  reloadSharedInventory,
  subscribeInventory,
  updateInventoryItem,
} from "@/lib/inventory-store";
import { BoardNav } from "@/components/shop/board-nav";
import { InventoryAttention, InventoryUsageLog } from "@/components/inventory/inventory-usage";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { usePullToRefresh } from "@/components/shop/use-pull-to-refresh";
import { useMobileViewportRestore } from "@/components/shop/use-mobile-viewport";

export function InventoryApp() {
  const board = useSyncExternalStore(
    subscribeInventory,
    getInventorySnapshot,
    getServerInventorySnapshot,
  );
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  useMobileViewportRestore(scrollRef);

  const runReload = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await reloadSharedInventory();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    let lastReload = Date.now();
    const reload = (minGapMs: number) => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastReload < minGapMs) return;
      lastReload = Date.now();
      void reloadSharedInventory();
    };
    const onVisible = () => reload(30_000);
    const id = window.setInterval(() => reload(85_000), 90_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const { pull, armed } = usePullToRefresh(scrollRef, runReload, refreshing);

  const visible = useMemo(() => {
    return activeInventory(board.items).sort((a, b) => {
      const names = a.partName.localeCompare(b.partName, undefined, { sensitivity: "base" });
      if (names !== 0) return names;
      return a.id.localeCompare(b.id);
    });
  }, [board.items]);

  const balance = useMemo(() => inventoryBalance(board.items), [board.items]);

  const onChange = (id: string, patch: Partial<InventoryItem>) => updateInventoryItem(id, patch);

  const refreshLabel = refreshing
    ? "Refreshing…"
    : armed
      ? "Release to refresh"
      : pull > 16
        ? "Pull to refresh"
        : `${visible.length} item${visible.length === 1 ? "" : "s"}`;

  return (
    <div className="shop-shell flex min-w-0 flex-col bg-background text-foreground">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-surface-2 text-foreground border border-border",
        }}
      />

      <div
        className="board-refresh no-print parts-toolbar"
        data-refreshing={refreshing || undefined}
        style={{ height: "auto", minHeight: Math.max(40, refreshing ? 44 : pull) }}
      >
        <BoardNav current="inventory" />
        <p className="px-1 text-sm font-semibold tabular-nums" aria-label="Inventory balance">
          Balance {formatInventoryMoney(balance)}
        </p>
        <p className="hidden min-w-0 truncate md:block" role="status" aria-live="polite">
          {refreshLabel}
        </p>
      </div>

      <main ref={scrollRef} className="board-scroll min-h-0 min-w-0 flex-1">
        <p className="print-only mb-3 px-3 font-display text-2xl font-semibold">
          NGC Inventory · {formatInventoryMoney(balance)}
        </p>
        <p className="sr-only">Inventory spreadsheet · quantities and value on hand</p>

        <InventoryAttention flags={board.flags} sync={board.sync} />

        {visible.length === 0 ? (
          <div className="m-3 rounded-lg border border-border bg-surface px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold">No inventory on hand</p>
            <p className="mt-2 text-sm text-muted">
              A row is added when an Inventory parts line is received, or when stock is entered here.
              Deleting a parts line leaves the row, its qty, and its value in place.
            </p>
          </div>
        ) : (
          <InventoryTable items={visible} onChange={onChange} />
        )}
        <InventoryUsageLog usage={board.usage} />
      </main>
    </div>
  );
}
