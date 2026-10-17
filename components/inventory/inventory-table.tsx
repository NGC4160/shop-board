"use client";

import { useState } from "react";
import {
  formatInventoryMoney,
  inventoryLineValue,
  isLowStock,
  type InventoryItem,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

type InventoryTableProps = {
  items: InventoryItem[];
  onChange: (id: string, patch: Partial<InventoryItem>) => boolean;
};

export function InventoryTable({ items, onChange }: InventoryTableProps) {
  return (
    <table className="inventory-sheet text-left">
      <colgroup>
        <col className="inventory-col-name" />
        <col className="inventory-col-number" />
        <col className="inventory-col-supplier" />
        <col className="inventory-col-description" />
        <col className="inventory-col-qty" />
        <col className="inventory-col-qty" />
        <col className="inventory-col-qty" />
        <col className="inventory-col-money" />
        <col className="inventory-col-money" />
      </colgroup>
      <thead className="text-sm">
        <tr>
          <th className="board-sticky-head border-b border-r border-border px-1 py-1">
            <ColumnLabel>Part</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-r border-border px-1 py-1">
            <ColumnLabel>Part number</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Supplier</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Description</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Qty on hand</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Min qty</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Min order</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Unit value</ColumnLabel>
          </th>
          <th className="board-sticky-head border-b border-border px-1 py-1">
            <ColumnLabel>Line total</ColumnLabel>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const low = isLowStock(item);
          return (
            <tr key={item.id} className="align-top" data-inventory-id={item.id}>
              <td className="border-r border-b border-border px-2 py-2">
                <p className="text-base font-semibold">{item.partName || "—"}</p>
              </td>
              <td className="border-r border-b border-border px-1 py-1">
                <TextField
                  label="Part number"
                  value={item.partNumber}
                  placeholder="Part #"
                  className="font-mono"
                  onCommit={(partNumber) => onChange(item.id, { partNumber })}
                />
              </td>
              <td className="border-b border-border px-2 py-2 text-base">{item.supplier || "—"}</td>
              <td className="border-b border-border px-2 py-2 text-base">{item.description || "—"}</td>
              <td className="border-b border-border px-1 py-1">
                <div className="grid gap-1">
                  <QtyField
                    label="Qty on hand"
                    value={item.qtyOnHand}
                    low={low}
                    onCommit={(qtyOnHand) => onChange(item.id, { qtyOnHand: qtyOnHand ?? 0 })}
                  />
                  {low ? (
                    <span className="px-1 text-xs font-semibold tracking-wide text-chip-clay-fg uppercase">
                      Low
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="border-b border-border px-1 py-1">
                <QtyField
                  label="Min qty"
                  value={item.minQty}
                  allowBlank
                  onCommit={(minQty) => onChange(item.id, { minQty })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <QtyField
                  label="Min order qty"
                  value={item.minOrderQty}
                  allowBlank
                  onCommit={(minOrderQty) => onChange(item.id, { minOrderQty })}
                />
              </td>
              <td className="border-b border-border px-1 py-1">
                <QtyField
                  label="Unit value"
                  value={item.unitValue}
                  allowBlank
                  onCommit={(unitValue) => onChange(item.id, { unitValue })}
                />
              </td>
              <td className="border-b border-border px-2 py-2 font-mono text-base tabular-nums">
                {formatInventoryMoney(inventoryLineValue(item))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ColumnLabel({ children }: { children: string }) {
  return (
    <span className="flex min-h-9 w-full items-center px-1.5">
      <span className="min-w-0 whitespace-normal text-xs font-semibold leading-tight tracking-wide text-muted uppercase">
        {children}
      </span>
    </span>
  );
}

function TextField({
  label,
  value,
  placeholder,
  className,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = (raw: string) => {
    const next = raw.replace(/\s+/g, " ").trim();
    setDraft(next);
    if (next !== value) onCommit(next);
  };
  return (
    <input
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 text-base text-foreground",
        className,
      )}
    />
  );
}

function QtyField({
  label,
  value,
  allowBlank = false,
  low = false,
  onCommit,
}: {
  label: string;
  value: number | null;
  allowBlank?: boolean;
  low?: boolean;
  onCommit: (next: number | null) => void;
}) {
  const shown = value == null ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    setDraft(shown);
  }

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (allowBlank) {
        setDraft("");
        if (value != null) onCommit(null);
        return;
      }
      setDraft("0");
      if (value !== 0) onCommit(0);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(shown);
      return;
    }
    setDraft(String(parsed));
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      placeholder={allowBlank ? "—" : "0"}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-11 min-w-0 w-full rounded-sm border border-border bg-background px-2.5 font-mono text-base tabular-nums",
        low && "border-chip-clay-fg bg-chip-clay text-chip-clay-fg",
      )}
    />
  );
}
