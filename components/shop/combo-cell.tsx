"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { listedOtherError } from "@/lib/jobs";

const OTHER_VALUE = "__other__";

type ComboCellProps = {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  placeholder?: string;
  selectClassName?: string;
  errorFor?: (next: string) => string | null;
  "aria-label"?: string;
};

export function ComboCell({
  value,
  options,
  onChange,
  emptyLabel,
  placeholder,
  selectClassName,
  errorFor,
  "aria-label": ariaLabel,
}: ComboCellProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pickedOther, setPickedOther] = useState(false);
  const [textDraft, setTextDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);
  const [query, setQuery] = useState("");
  const [warning, setWarning] = useState("");

  if (value !== seenValue) {
    setSeenValue(value);
    setTextDraft(value);
    if (options.includes(value) || value === "") setPickedOther(false);
  }

  const isKnown = value === "" || options.includes(value);
  const showText = !isKnown || pickedOther;

  const menuOptions = useMemo(() => {
    const items = [
      ...(emptyLabel !== undefined ? [{ value: "", label: emptyLabel }] : []),
      ...options.map((option) => ({ value: option, label: option })),
      { value: OTHER_VALUE, label: "Other…" },
    ];
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.label.toLowerCase().includes(needle));
  }, [emptyLabel, options, query]);

  const currentIndex = Math.max(
    0,
    menuOptions.findIndex((option) =>
      showText ? option.value === OTHER_VALUE : option.value === value,
    ),
  );
  const [highlight, setHighlight] = useState(currentIndex);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const commit = (next: string) => {
    if (next === OTHER_VALUE) {
      setPickedOther(true);
      setTextDraft("");
      setWarning("");
      setOpen(false);
      queueMicrotask(() => textRef.current?.focus());
      return;
    }
    setPickedOther(false);
    setWarning("");
    setTextDraft(next);
    setOpen(false);
    setQuery("");
    onChange(next);
  };

  const commitText = (next: string) => {
    const trimmed = next.trim();
    const listed = listedOtherError(trimmed, options);
    if (listed) {
      setWarning(listed);
      return;
    }
    const error = errorFor?.(trimmed) ?? null;
    if (error) {
      setWarning(error);
      return;
    }
    setWarning("");
    setPickedOther(false);
    onChange(trimmed);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      setHighlight(currentIndex);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(menuOptions.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(0, index - 1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = menuOptions[highlight];
      if (picked) commit(picked.value);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      {showText ? (
        <input
          ref={textRef}
          aria-label={ariaLabel}
          value={textDraft}
          placeholder={placeholder}
          onChange={(event) => {
            setTextDraft(event.target.value);
            setWarning("");
          }}
          onBlur={() => commitText(textDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className={cn(
            "h-11 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 text-sm text-foreground",
            warning && "border-danger",
            selectClassName,
          )}
        />
      ) : (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
            setHighlight(currentIndex);
          }}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex h-11 w-full min-w-0 items-center justify-between gap-1 rounded-sm border border-border bg-background px-2.5 text-left text-sm text-foreground",
            !value && "text-subtle",
            selectClassName,
          )}
        >
          <span className="min-w-0 truncate">{value || emptyLabel || placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-subtle" />
        </button>
      )}
      {warning ? <p className="mt-1 text-xs font-medium text-danger">{warning}</p> : null}
      {open ? (
        <div
          id={listId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute z-40 mt-1 max-h-64 w-full min-w-48 overflow-hidden rounded-md border border-border bg-surface-2 shadow-[var(--shadow-lift)]"
        >
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            placeholder="Filter…"
            className="h-11 w-full border-b border-border bg-surface px-3 text-sm text-foreground"
          />
          <ul className="max-h-52 overflow-y-auto py-1">
            {menuOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">No matches</li>
            ) : (
              menuOptions.map((option, index) => {
                const selected = option.value === value && !showText;
                return (
                  <li key={`${option.value}-${option.label}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => commit(option.value)}
                      className={cn(
                        "flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm",
                        index === highlight ? "bg-surface-3" : "bg-transparent",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {selected ? <Check className="size-4 text-accent" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
