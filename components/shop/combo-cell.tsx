"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { listedOtherError, commitOtherValue } from "@/lib/jobs";

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
  const selectId = useId();
  const textRef = useRef<HTMLInputElement>(null);
  const [pickedOther, setPickedOther] = useState(false);
  const [textDraft, setTextDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);
  const [warning, setWarning] = useState("");

  if (value !== seenValue) {
    setSeenValue(value);
    setTextDraft(value);
    if (options.includes(value) || value === "") setPickedOther(false);
  }

  useEffect(() => {
    if (pickedOther) textRef.current?.focus();
  }, [pickedOther]);

  const extraOption = value && !options.includes(value) && !pickedOther ? value : "";

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

  if (pickedOther) {
    return (
      <div className="relative min-w-0">
        <input
          ref={textRef}
          aria-label={ariaLabel}
          value={textDraft}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            setTextDraft(event.target.value);
            setWarning("");
          }}
          onBlur={() => commitText(textDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setPickedOther(false);
              setTextDraft(value);
              setWarning("");
            }
          }}
          className={cn(
            "h-11 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 text-base text-foreground",
            warning && "border-danger",
            selectClassName,
          )}
        />
        {warning ? <p className="mt-1 text-xs font-medium text-danger">{warning}</p> : null}
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <select
        id={selectId}
        aria-label={ariaLabel}
        data-combo={ariaLabel}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER_VALUE) {
            setPickedOther(true);
            setTextDraft("");
            setWarning("");
            return;
          }
          setWarning("");
          onChange(next);
        }}
        className={cn(
          "board-select h-11 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 pr-8 text-base text-foreground",
          !value && "text-subtle",
          selectClassName,
        )}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {!value && emptyLabel === undefined ? (
          <option value="">{placeholder || "Select"}</option>
        ) : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {extraOption ? <option value={extraOption}>{extraOption}</option> : null}
        <option value={OTHER_VALUE}>Other…</option>
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-subtle" />
    </div>
  );
}
