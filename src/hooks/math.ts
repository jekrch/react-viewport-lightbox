/**
 * Pure geometry/threshold helpers shared by the interaction hooks. Kept free of
 * React and DOM globals so they can be unit-tested in isolation.
 */

export interface Dims {
  width: number;
  height: number;
}

/**
 * Clamp a pan translation so the scaled image edge can't move past the
 * viewport edge. Returns `{ x: 0, y: 0 }` when not zoomed or when base
 * dimensions are unknown.
 */
export function clampTranslate(
  x: number,
  y: number,
  scale: number,
  baseDims: Dims,
  viewport: Dims,
): { x: number; y: number } {
  if (scale <= 1) return { x: 0, y: 0 };
  const { width: baseW, height: baseH } = baseDims;
  if (baseW === 0 || baseH === 0) return { x: 0, y: 0 };

  const scaledHalfW = (baseW * scale) / 2;
  const scaledHalfH = (baseH * scale) / 2;
  const vpHalfW = viewport.width / 2;
  const vpHalfH = viewport.height / 2;

  const maxX = Math.max(0, scaledHalfW - vpHalfW);
  const maxY = Math.max(0, scaledHalfH - vpHalfH);

  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

export type SlideAction = "prev" | "next" | "snap";

export interface ResolveSlideArgs {
  /** Current horizontal swipe offset in px (positive = dragged right). */
  offset: number;
  /** Elapsed time of the gesture in ms (used for fling velocity). */
  elapsedMs: number;
  viewportWidth: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** Fraction of viewport width past which a drag commits. Default 0.25. */
  distanceThreshold?: number;
  /** px/ms past which a fast fling commits regardless of distance. Default 0.4. */
  velocityThreshold?: number;
}

/**
 * Decide whether a released swipe should navigate `prev`/`next` or `snap` back,
 * based on distance and fling velocity.
 */
export function resolveSlideDirection({
  offset,
  elapsedMs,
  viewportWidth,
  hasPrev,
  hasNext,
  distanceThreshold = 0.25,
  velocityThreshold = 0.4,
}: ResolveSlideArgs): SlideAction {
  const velocity = Math.abs(offset) / Math.max(elapsedMs, 1);
  const threshold = viewportWidth * distanceThreshold;
  const committed = Math.abs(offset) > threshold || velocity > velocityThreshold;

  if (offset > 0 && hasPrev && committed) return "prev";
  if (offset < 0 && hasNext && committed) return "next";
  return "snap";
}
