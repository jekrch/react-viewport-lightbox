/**
 * Pure geometry/threshold helpers shared by the interaction hooks. Kept free of
 * React and DOM globals so they can be unit-tested in isolation.
 */

import type { ViewerRect } from "../types";

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

/* Cropped thumbnails ------------------------------------------------------- */

/**
 * A rectangle's insets, in px.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Where an `object-position` keyword sits along its axis, as a fraction. */
const POSITION_KEYWORDS: Record<string, number> = {
  left: 0,
  top: 0,
  center: 0.5,
  right: 1,
  bottom: 1,
};

function positionAxis(token: string | undefined, fallback: number): number {
  if (!token) return fallback;
  const keyword = POSITION_KEYWORDS[token];
  if (keyword !== undefined) return keyword;
  const pct = /^(-?[\d.]+)%$/.exec(token);
  return pct ? Number(pct[1]) / 100 : fallback;
}

/**
 * Read a computed `object-position` as a pair of fractions: 0 pins the image's
 * leading edge to its box's, 1 its trailing edge, 0.5 centers it.
 *
 * Browsers compute the property to percentages, which is what this reads. A
 * length is an offset in px rather than a fraction of the overflow, so it can't
 * be expressed here and is treated as centered rather than guessed at.
 */
export function parseObjectPosition(value: string): { x: number; y: number } {
  const parts = value.trim().split(/\s+/);
  return { x: positionAxis(parts[0], 0.5), y: positionAxis(parts[1], 0.5) };
}

/**
 * The rect the WHOLE image occupies when `object-fit: cover` fills `box` with
 * it — larger than `box` on one axis, that overflow being what the box crops.
 *
 * This is the rect a shared-element flight should target for a cropped
 * thumbnail. Flying an uncropped image into the thumbnail's literal box
 * squashes it for the length of the animation, hardest on exactly the images
 * the crop works hardest on; landing on the cover rect instead keeps the flight
 * in proportion, and the slice actually on screen still lines up with the
 * thumbnail.
 */
export function coverRect(
  box: ViewerRect,
  natural: Dims,
  position: { x: number; y: number },
): ViewerRect {
  const scale = Math.max(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    left: box.left + (box.width - width) * position.x,
    top: box.top + (box.height - height) * position.y,
    width,
    height,
  };
}

/**
 * The crop a thumbnail imposes, in the *untransformed* image's own pixels.
 *
 * `rest` is the flying image at rest, `origin` the rect it lands on, and `clip`
 * the window the thumbnail leaves open on that rect. Masks and clips apply
 * before an element's transform, so the insets are divided back through the
 * flight's scale. Negative insets — a thumbnail hanging off the viewport edge,
 * a rounding wobble — are floored at zero.
 */
export function cropInsets(rest: ViewerRect, origin: ViewerRect, clip: ViewerRect): Insets {
  const sx = origin.width / rest.width;
  const sy = origin.height / rest.height;
  return {
    top: Math.max(0, (clip.top - origin.top) / sy),
    right: Math.max(0, (origin.left + origin.width - (clip.left + clip.width)) / sx),
    bottom: Math.max(0, (origin.top + origin.height - (clip.top + clip.height)) / sy),
    left: Math.max(0, (clip.left - origin.left) / sx),
  };
}

/** True when a crop takes anything off worth animating. */
export function cropsAnything(insets: Insets): boolean {
  return insets.top + insets.right + insets.bottom + insets.left > 0.5;
}

/**
 * How soft the join between the kept slice and the faded strip is at its
 * softest: a share of the strip itself, so it reads the same on a thumbnail
 * taking a sliver off the side and on one taking half the picture.
 */
export function cropFeather(insets: Insets): number {
  const horizontal = insets.left + insets.right > 0;
  const widest = horizontal
    ? Math.max(insets.left, insets.right)
    : Math.max(insets.top, insets.bottom);
  return widest * 0.4;
}

/**
 * The mask that fades a cropped thumbnail's discarded strip in or out over a
 * shared-element flight.
 *
 * A cropped thumbnail shows a slice of its image, so the flight has to land on
 * the whole image at the crop's scale (see {@link coverRect}) — which leaves
 * the cropped-away parts painted on screen at the end of a collapse, to blink
 * out with the viewer a frame later, and painted from the first frame of an
 * expand, to appear out of nowhere. Fading them is what makes the hand-off
 * invisible.
 *
 * It fades rather than closing inward. An aperture — a hard edge sweeping onto
 * the thumbnail's box — lands in the right place, but a cut moving across the
 * picture at the end of a flight reads as another thing happening rather than
 * as the flight finishing. So the geometry holds still: the strip sits where it
 * always was and its opacity goes.
 *
 * `progress` is how far the fade has gone: 0 is the whole picture untouched, 1
 * is only the slice the thumbnail shows. `feather` softens the join, in the
 * image's own pixels, and shrinks along with the fade so the last frame is a
 * clean edge on the thumbnail's box rather than a gradient hanging off it.
 *
 * One gradient is the whole mask because a `cover` crop bites on exactly one
 * axis: the scale is the *larger* of the two ratios, so only the other one
 * overflows.
 */
export function cropMask(insets: Insets, size: Dims, progress: number, feather: number): string {
  const horizontal = insets.left + insets.right > 0;
  const lead = horizontal ? insets.left : insets.top;
  const trail = horizontal ? insets.right : insets.bottom;
  const extent = horizontal ? size.width : size.height;

  const alpha = 1 - Math.min(1, Math.max(0, progress));
  const ramp = feather * alpha;
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  const stop = (a: number, at: number) => `rgba(0,0,0,${Math.round(a * 1000) / 1000}) ${px(at)}`;

  return `linear-gradient(${horizontal ? "to right" : "to bottom"}, ${[
    stop(alpha, 0),
    stop(alpha, Math.max(0, lead - ramp)),
    stop(1, lead),
    stop(1, extent - trail),
    stop(alpha, Math.min(extent, extent - trail + ramp)),
    stop(alpha, extent),
  ].join(", ")})`;
}

/**
 * The fade's progress a fraction `u` into a flight: 1 is cropped to the
 * thumbnail's slice, 0 is the whole picture.
 *
 * The two directions are paced differently, and deliberately so. A flight eases
 * out hard — the image is within a few percent of its final size around
 * halfway through the clock — which means "how far through the animation" and
 * "how much the picture still appears to be moving" are not the same quantity,
 * and the fade has to be paced against the second one.
 *
 * On a COLLAPSE that mismatch is the effect: the picture settles onto its
 * thumbnail early and the strip it has no room for goes on dissolving off it,
 * which is exactly the hand-off being made gradually. It only has to finish
 * before the end, so a stray frame of timing slop can't leave a sliver to blink
 * out with the viewer.
 *
 * On an EXPAND the same mismatch is a flaw: edges brightening onto a picture
 * that has already stopped moving read as the image arriving unfinished and
 * then correcting itself, and with the fade running to the last frame it
 * finishes on the very tick the flight releases its transform. So the fade is
 * compressed into the part of the flight where the picture is still visibly
 * growing, and is a no-op well before the hand-off — after a short hold at the
 * start, so the opening frames match the thumbnail exactly.
 */
const COLLAPSE_FADE_END = 0.85;
const EXPAND_FADE_FROM = 0.08;
const EXPAND_FADE_TO = 0.45;

export function cropFadeProgress(u: number, direction: "expand" | "collapse"): number {
  const clamped = Math.min(1, Math.max(0, u));
  if (direction === "collapse") return Math.min(1, clamped / COLLAPSE_FADE_END);
  const span = (clamped - EXPAND_FADE_FROM) / (EXPAND_FADE_TO - EXPAND_FADE_FROM);
  return 1 - Math.min(1, Math.max(0, span));
}
