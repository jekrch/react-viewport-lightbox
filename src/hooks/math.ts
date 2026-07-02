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

/**
 * Compute the pan translation that keeps the content under a focal point
 * (cursor or pinch midpoint) anchored as the scale changes from `prevScale`
 * to `nextScale`.
 *
 * The viewer scales the wrapper about the viewport center, so the on-screen
 * position of a content point is `center + scale * (point - center) + t`.
 * Solving "the content at `focal` before the zoom is still at `focal` after"
 * for the new translate gives the closed form below. Pass `focal` in viewport
 * coordinates (e.g. `clientX`/`clientY`). The result is unclamped — feed it
 * through {@link clampTranslate} before applying.
 */
export function zoomToPoint(
  prevScale: number,
  nextScale: number,
  prev: { x: number; y: number },
  focal: { x: number; y: number },
  viewport: Dims,
): { x: number; y: number } {
  const relX = focal.x - viewport.width / 2;
  const relY = focal.y - viewport.height / 2;
  const k = nextScale / prevScale;
  return {
    x: relX * (1 - k) + k * prev.x,
    y: relY * (1 - k) + k * prev.y,
  };
}

export interface ComputeZoomTransformArgs {
  prevScale: number;
  nextScale: number;
  /** Current translate. */
  prev: { x: number; y: number };
  /** Focal point in viewport coords (cursor / pinch midpoint). */
  focal: { x: number; y: number };
  viewport: Dims;
  baseDims: Dims;
  /** When true, anchor the zoom on `focal`; when false, zoom about the center. */
  zoomToCursor: boolean;
  /**
   * Extra translation added to the focal-anchored result before clamping. Used
   * by pinch to also pan by however far the midpoint drifted between frames.
   */
  focalPan?: { x: number; y: number };
}

/**
 * Resolve the clamped translate for a zoom step, sharing the wheel and pinch
 * branch logic: snaps to the origin when zooming back to ≤ 1, anchors on the
 * focal point when `zoomToCursor`, otherwise holds the current translate — then
 * clamps the result to the viewport.
 */
export function computeZoomTransform({
  prevScale,
  nextScale,
  prev,
  focal,
  viewport,
  baseDims,
  zoomToCursor,
  focalPan,
}: ComputeZoomTransformArgs): { x: number; y: number } {
  if (nextScale <= 1) return { x: 0, y: 0 };
  if (zoomToCursor) {
    const f = zoomToPoint(prevScale, nextScale, prev, focal, viewport);
    return clampTranslate(
      f.x + (focalPan?.x ?? 0),
      f.y + (focalPan?.y ?? 0),
      nextScale,
      baseDims,
      viewport,
    );
  }
  return clampTranslate(prev.x, prev.y, nextScale, baseDims, viewport);
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
