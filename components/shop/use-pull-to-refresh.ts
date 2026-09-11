"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const THRESHOLD = 72;
const MAX_PULL = 128;

function isInteractive(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, button, a, [role='dialog']"));
}

export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  busy: boolean,
) {
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const startTop = useRef(0);
  const axis = useRef<"x" | "y" | null>(null);
  const tracking = useRef(false);
  const busyRef = useRef(busy);
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    busyRef.current = busy;
    refreshRef.current = onRefresh;
  }, [busy, onRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const setPullBoth = (next: number) => {
      pullRef.current = next;
      setPull(next);
    };

    const onStart = (x: number, y: number, target: EventTarget | null) => {
      if (busyRef.current) return false;
      if (isInteractive(target)) return false;
      if (el.scrollTop > 1) return false;
      startX.current = x;
      startY.current = y;
      startTop.current = el.scrollTop;
      axis.current = null;
      tracking.current = true;
      return true;
    };

    const onMove = (x: number, y: number, prevent: () => void) => {
      if (!tracking.current) return;
      const dx = x - startX.current;
      const dy = y - startY.current;
      if (!axis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis.current = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      }
      if (axis.current !== "y") return;
      if (startTop.current > 1 || dy <= 0) {
        setPullBoth(0);
        return;
      }
      prevent();
      setPullBoth(Math.min(MAX_PULL, dy * 0.42));
    };

    const onEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      const released = pullRef.current;
      axis.current = null;
      setPullBoth(0);
      if (released >= THRESHOLD && !busyRef.current) {
        void refreshRef.current();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      onStart(touch.clientX, touch.clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      onMove(touch.clientX, touch.clientY, () => {
        if (event.cancelable) event.preventDefault();
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!onStart(event.clientX, event.clientY, event.target)) return;
      el.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      onMove(event.clientX, event.clientY, () => {});
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", onEnd);
    };
  }, [scrollRef]);

  return { pull, armed: pull >= THRESHOLD };
}
