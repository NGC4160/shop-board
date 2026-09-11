"use client";

import { RefreshCw } from "lucide-react";
import { formatHcpSyncButtonLabel } from "@/lib/hcp-sync-status";

type HcpSyncButtonProps = {
  busy: boolean;
  onSync: () => void;
};

export function HcpSyncButton({ busy, onSync }: HcpSyncButtonProps) {
  return (
    <button
      type="button"
      onClick={onSync}
      disabled={busy}
      aria-label="Sync Housecall Pro"
      aria-busy={busy}
      data-testid="hcp-sync-button"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface-3 px-2.5 text-sm font-semibold text-accent hover:border-border-strong hover:bg-surface disabled:cursor-wait disabled:opacity-70"
    >
      <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
      {formatHcpSyncButtonLabel(busy)}
    </button>
  );
}
