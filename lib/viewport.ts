/** Clamp a scroller offset so leftover iOS keyboard pan cannot overscroll. */
export function clampScrollOffset(offset: number, extent: number, viewport: number): number {
  const max = Math.max(0, extent - Math.max(0, viewport));
  if (!Number.isFinite(offset)) return 0;
  return Math.min(max, Math.max(0, offset));
}

export function documentScrollNeedsReset(scrollX: number, scrollY: number): boolean {
  return scrollX !== 0 || scrollY !== 0;
}
