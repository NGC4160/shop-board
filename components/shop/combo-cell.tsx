"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { listedOtherError, commitOtherValue } from "@/lib/jobs";

const OTHER_VALUE = "__other__";

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

function readMenuPos(el: HTMLElement | null): MenuPos | null {
  const rect = el?.getBoundingClientRect();
  if (!rect) return null;
  const visible =
    rect.bottom > 8 &&
    rect.top < window.innerHeight - 8 &&
    rect.right > 8 &&
    rect.left < window.innerWidth - 8;
  if (!visible) return null;
  const width = Math.min(Math.max(rect.width, 192), window.innerWidth - 16);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  if (left < 8) left = 8;
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const flipUp = below < 160 && above > below;
  const maxHeight = Math.max(160, Math.min(256, flipUp ? above : below));
  const top = flipUp ? Math.max(8, rect.top - maxHeight) : rect.bottom + 4;
  return { top, left, width, maxHeight };
}

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
  const menuRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pickedOther, setPickedOther] = useState(false);
  const [textDraft, setTextDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);
  const [query, setQuery] = useState("");
  const [warning, setWarning] = useState("");
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

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

  const openMenu = () => {
    const pos = readMenuPos(rootRef.current);
    if (pos) setMenuPos(pos);
    setQuery("");
    setHighlight(currentIndex);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const pos = readMenuPos(rootRef.current);
      if (!pos) {
        setOpen(false);
        setQuery("");
        return;
      }
      setMenuPos(pos);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
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
    if (trimmed === "") {
      const resolved = commitOtherValue(trimmed, value, emptyLabel);
      setWarning("");
      setPickedOther(false);
      setTextDraft(resolved.next);
      if (resolved.persist) onChange(resolved.next);
      return;
    }
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
      openMenu();
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
            "h-11 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 text-base text-foreground md:text-sm",
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
            if (open) {
              setOpen(false);
              setQuery("");
              return;
            }
            openMenu();
          }}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex h-11 w-full min-w-0 items-center justify-between gap-1 rounded-sm border border-border bg-background px-2.5 text-left text-base text-foreground md:text-sm",
            !value && "text-subtle",
            selectClassName,
          )}
        >
          <span className="min-w-0 truncate">{value || emptyLabel || placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-subtle" />
        </button>
      )}
      {warning ? <p className="mt-1 text-xs font-medium text-danger">{warning}</p> : null}
      {open && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              onKeyDown={onMenuKeyDown}
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                maxHeight: menuPos.maxHeight,
              }}
              className="fixed z-40 overflow-hidden rounded-md border border-border bg-surface-2 shadow-[var(--shadow-lift)]"
            >
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                placeholder="Filter…"
                className="h-11 w-full border-b border-border bg-surface px-3 text-base text-foreground md:text-sm"
              />
              <ul className="overflow-y-auto py-1" style={{ maxHeight: Math.max(88, menuPos.maxHeight - 44) }}>
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
