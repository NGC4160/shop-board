"use client";

import { useEffect, type RefObject } from "react";
import { clampScrollOffset, documentScrollNeedsReset } from "@/lib/viewport";

/** Keyboard close on iOS is async; one frame is not enough. */
const RESTORE_DELAYS_MS = [0, 80, 320];

function applyVisualHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  if (height > 0) {
    document.documentElement.style.setProperty("--shop-visual-height", `${Math.round(height)}px`);
  }
}

function restoreDocumentScroll() {
  if (documentScrollNeedsReset(window.scrollX, window.scrollY)) {
    window.scrollTo(0, 0);
  }
  document.documentElement.scrollLeft = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollLeft = 0;
  document.body.scrollTop = 0;
}

function restoreBoardScroller(scroller: HTMLElement) {
  const nextLeft = clampScrollOffset(scroller.scrollLeft, scroller.scrollWidth, scroller.clientWidth);
  const nextTop = clampScrollOffset(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
  if (scroller.scrollLeft !== nextLeft) scroller.scrollLeft = nextLeft;
  if (scroller.scrollTop !== nextTop) scroller.scrollTop = nextTop;
}

function relayoutScroller(scroller: HTMLElement) {
  const left = scroller.scrollLeft;
  const top = scroller.scrollTop;
  const previous = scroller.style.overflow;
  scroller.style.overflow = "hidden";
  void scroller.offsetHeight;
  scroller.style.overflow = previous;
  scroller.scrollLeft = left;
  scroller.scrollTop = top;
}

/**
 * iOS Safari: focusing a cell in the wide table often scrolls the
 * *document* (not just `.board-scroll`). After the keyboard closes, leftover
 * window.scrollX / a stale visualViewport height paints the body background
 * as a black slab and can shove the table off-screen.
 */
export function useMobileViewportRestore(scrollRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scroller = scrollRef.current;

    const restore = (relayout = false) => {
      applyVisualHeight();
      restoreDocumentScroll();
      if (!scroller) return;
      if (relayout) relayoutScroller(scroller);
      restoreBoardScroller(scroller);
    };

    const onViewport = () => restore(false);
    const onBlur = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, select, textarea")) return;
      for (const delay of RESTORE_DELAYS_MS) {
        window.setTimeout(() => restore(true), delay);
      }
    };

    restore(false);
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    window.addEventListener("focusout", onBlur, true);
    window.addEventListener("orientationchange", onViewport);

    return () => {
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.removeEventListener("focusout", onBlur, true);
      window.removeEventListener("orientationchange", onViewport);
      document.documentElement.style.removeProperty("--shop-visual-height");
    };
  }, [scrollRef]);
}
