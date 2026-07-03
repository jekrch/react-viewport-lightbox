import { useCallback, useLayoutEffect, useEffect, useRef, useState, type RefObject } from "react";
import type { ViewerRect } from "../types";

// Duration of the shared-element zoom (open expand / close collapse) in ms.
export const ANIM_MS = 250;
// Vertical breathing room reserved around the image, per side, in px.
export const IMG_PADDING = 44;
// Decelerating ease for the shared-element zoom so it settles softly.
const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * CSS transform that maps `from` (the element's current rect) onto `to`,
 * assuming a `top left` transform-origin. Used for the FLIP-style thumbnail
 * zoom: place the full image where the thumbnail is, then animate the transform
 * away so it glides into its real position.
 */
function flipTransform(from: ViewerRect, to: ViewerRect): string {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

/**
 * True when the Web Animations API is usable on `el`. jsdom (tests) and very old
 * browsers lack `Element.prototype.animate`, so callers fall back to no anim.
 */
function canAnimate(el: HTMLElement | null): el is HTMLElement {
  return !!el && typeof el.animate === "function";
}

/**
 * The `border-radius`, in the image's own coordinate space, that renders as
 * `radius` px once the FLIP transform has scaled the image by `sx`/`sy` into the
 * thumbnail pose. Rendered corner size is the local radius times the axis scale,
 * so the local value is the target pre-divided by the scale (the `x / y`
 * elliptical form keeps it right under a non-uniform scale). Lets the image's
 * corners morph to the thumbnail's radius across the flight instead of the
 * rounding flattening as it shrinks and then snapping back on hand-off.
 */
function scaledRadius(radius: number, sx: number, sy: number): string {
  return `${radius / sx}px / ${radius / sy}px`;
}

/** A source rect plus the corner radius to hand off to, when it's known. */
interface ResolvedOrigin {
  rect: ViewerRect;
  /** Thumbnail corner radius in px when the source was an element; null for a bare rect. */
  radius: number | null;
}

/**
 * Normalize a `getOrigin` result. An element yields both its on-screen rect and
 * its computed corner radius (so the zoom can match the thumbnail's rounding
 * exactly); a bare {@link ViewerRect} yields the rect with an unknown radius
 * (the zoom falls back to the image's own). Element-ness is duck-typed on
 * `getBoundingClientRect` so a plain rect object never trips it.
 */
function resolveOrigin(src: HTMLElement | ViewerRect | null | undefined): ResolvedOrigin | null {
  if (!src) return null;
  if (typeof (src as HTMLElement).getBoundingClientRect === "function") {
    const el = src as HTMLElement;
    return {
      rect: el.getBoundingClientRect(),
      radius: parseFloat(getComputedStyle(el).borderRadius) || 0,
    };
  }
  return { rect: src as ViewerRect, radius: null };
}

/**
 * True when `rect` overlaps the current viewport at all. A thumbnail scrolled
 * out of view returns its (offscreen) rect just the same, so collapsing into it
 * would fly the image off to nowhere — callers fall back to a plain fade in that
 * case.
 */
function isRectInViewport(rect: ViewerRect): boolean {
  if (typeof window === "undefined") return true;
  return (
    rect.top < window.innerHeight &&
    rect.top + rect.height > 0 &&
    rect.left < window.innerWidth &&
    rect.left + rect.width > 0
  );
}

export interface SharedElementZoomArgs {
  getOrigin?: (index: number) => HTMLElement | ViewerRect | null;
  index: number;
  isZoomed: boolean;
  imgRef: RefObject<HTMLImageElement | null>;
  imgWrapperRef: RefObject<HTMLDivElement | null>;
  bottomBarRef: RefObject<HTMLDivElement | null>;
  measureBaseDims: () => void;
}

export interface SharedElementZoomState {
  /** True when the open should hold the image hidden until it decodes, then play the zoom. */
  gateEntry: boolean;
  /** True when a shared-element (thumbnail) zoom is configured at all. */
  zoomTransition: boolean;
  /** Whether the opening image has finished loading + decoding. */
  fullLoaded: boolean;
  /** True once the load runs long enough to warrant a spinner. */
  showSpinner: boolean;
  /** True only while a close-collapse FLIP is animating the image back into its source. */
  collapsing: boolean;
  /** `<img onLoad>` handler: measures base dims and marks the image ready once decoded. */
  onImageLoad: () => void;
  /** `<img onError>` handler: reveal a broken image so the open isn't stranded. */
  onImageError: () => void;
  /** Settle an in-flight entry zoom to its resting pose (call before measuring a close). */
  settleEntry: () => void;
  /** Play the collapse-into-thumbnail FLIP on close, when one applies. No-op otherwise. */
  playCollapse: () => void;
}

/**
 * Drives the shared-element thumbnail zoom: the image expands out of its source
 * thumbnail on open and collapses back into it on close, when `getOrigin` is
 * supplied. Also owns the load-gating (hold the image hidden until decoded so
 * the zoom plays from the thumbnail with no full-size flash) and the delayed
 * loading spinner.
 *
 * Driven by the Web Animations API on the <img> itself (zoom/pan owns the
 * wrapper): WAAPI plays from an explicit start keyframe and owns the transform
 * for the animation's duration, so React re-renders / the zoom-reset layout
 * effect / frame timing can't clobber it mid-flight (the failure mode of a raw
 * inline transition). The FLIP only ever scales down to ≤ 1, sidestepping the
 * iOS upscale-clip bug noted in useImageZoomPan.
 */
export function useSharedElementZoom({
  getOrigin,
  index,
  isZoomed,
  imgRef,
  imgWrapperRef,
  bottomBarRef,
  measureBaseDims,
}: SharedElementZoomArgs): SharedElementZoomState {
  const zoomTransition = !!getOrigin;
  const reduceMotion = prefersReducedMotion();
  // For a thumbnail zoom, hold the image hidden until its full-size source has
  // decoded, then play the zoom from the thumbnail. Animating before the bytes
  // are ready lets the browser paint a full-size frame first, which reads as the
  // image "expanding twice" on the first (uncached) open.
  const gateEntry = zoomTransition && !reduceMotion;

  // Whether the opening image has finished loading + decoding.
  const [fullLoaded, setFullLoaded] = useState(false);
  // Set true only if the load runs long, so quick opens never flash a spinner.
  const [showSpinner, setShowSpinner] = useState(false);
  // True only while a thumbnail FLIP collapse is animating the image back into
  // its source. Keeps the track opaque for that flight; a close without a
  // collapse (zoomed, reduced motion, no origin rect) leaves it false so the
  // track fades out instead of vanishing on unmount.
  const [collapsing, setCollapsing] = useState(false);

  const entryStartedRef = useRef(false);
  // Tears down the in-flight entry zoom (clears the inline transform, restores
  // the wrapper clip, cancels the animation). Set while the zoom is playing so
  // a close mid-flight can settle the image before measuring its collapse.
  const entryCleanupRef = useRef<(() => void) | null>(null);

  // Plays the shared-element zoom once, from the source thumbnail to the resting
  // image box. Only ever invoked after the full image has decoded (see below),
  // so the picture is paint-ready and the zoom can't flash a full-size frame.
  const runZoomEntry = useCallback(() => {
    if (entryStartedRef.current) return;
    if (!getOrigin || prefersReducedMotion()) return;
    const img = imgRef.current;
    const origin = resolveOrigin(getOrigin(index));
    if (!origin || !canAnimate(img)) return;
    const thumb = origin.rect;

    // Pin the image to its final constrained height before measuring. The bottom
    // bar is measured in a post-paint effect, so on the opening frame `bottomBarH`
    // is still 0 and the React-driven maxHeight is too tall; locking it here (read
    // straight from the bar's DOM) keeps a late bottomBarH measurement from
    // resizing the image mid-flight, which is what makes the open animation
    // visibly jump / re-expand. Held for the whole flight, then matched to React's
    // now-settled value on finish.
    const bottomH = bottomBarRef.current?.offsetHeight ?? 0;
    const lockedMaxHeight = `calc(100vh - ${bottomH + IMG_PADDING * 2}px)`;
    img.style.maxHeight = lockedMaxHeight;

    const imgRect = img.getBoundingClientRect();
    if (imgRect.width === 0 || imgRect.height === 0) {
      img.style.maxHeight = "";
      return;
    }
    entryStartedRef.current = true;

    const startTransform = flipTransform(imgRect, thumb);
    // Morph the corners between the image's own resting radius and the
    // thumbnail's over the flight, so the rounding tracks the zoom instead of
    // flattening as the image shrinks (the FLIP scales border-radius down with
    // it) and snapping back on hand-off. When the origin is an element we know
    // the thumbnail's real radius and land exactly on it; otherwise we keep the
    // image's own radius. The thumbnail-pose keyframe is scale-compensated so it
    // renders at the target. No radius anywhere → no keyframes.
    const restRadius = parseFloat(getComputedStyle(img).borderRadius) || 0;
    const thumbRadius = origin.radius ?? restRadius;
    const sx = thumb.width / imgRect.width;
    const sy = thumb.height / imgRect.height;
    const rounds = restRadius || thumbRadius;
    const radiusFrom = rounds ? { borderRadius: scaledRadius(thumbRadius, sx, sy) } : {};
    const radiusTo = rounds ? { borderRadius: `${restRadius}px` } : {};

    // Pin the image to the thumbnail pose *synchronously*, before the browser
    // can paint. On a first (uncached) open this handler fires the instant the
    // full image decodes; a WAAPI animation only composites its first frame on
    // the next frame, so without this inline transform the browser paints one
    // full-size frame first — the image flashes out to full size, then zooms in
    // again ("expands twice"). It only shows on the uncached load because the
    // cached path starts the zoom before the first paint. React never writes
    // `transform`, so it won't clobber this.
    img.style.transformOrigin = "top left";
    img.style.transform = startTransform;

    // The wrapper clips to its own (centered) box; while the image is translated
    // out to the thumbnail it would otherwise be sliced off. Lift the clip for
    // the flight, then restore it so zoom/pan clipping still works afterwards.
    const wrapper = imgWrapperRef.current;
    if (wrapper) wrapper.style.overflow = "visible";

    // Play from the thumbnail's box to the resting box. `fill: "forwards"` holds
    // the resting pose at the end so the inline start transform can't flash back
    // before cleanup swaps it out.
    const anim = img.animate(
      [
        { transformOrigin: "top left", transform: startTransform, ...radiusFrom },
        { transformOrigin: "top left", transform: "none", ...radiusTo },
      ],
      { duration: ANIM_MS, easing: ZOOM_EASE, fill: "forwards" },
    );
    const cleanup = () => {
      // Match the inline base to the held resting pose, then release the fill:
      // computed style stays "none" across the swap, so there's no flicker, and
      // the image is handed cleanly back to zoom/pan.
      img.style.transform = "";
      img.style.transformOrigin = "";
      if (wrapper) wrapper.style.overflow = "";
      // Keep the height pinned to the (by now settled) final value; releasing to
      // "" with no following render could briefly drop the constraint entirely.
      img.style.maxHeight = lockedMaxHeight;
      anim.cancel();
      entryCleanupRef.current = null;
    };
    entryCleanupRef.current = cleanup;
    anim.onfinish = cleanup;
  }, [getOrigin, index, imgRef, imgWrapperRef, bottomBarRef]);

  // Mark the opening image ready once it has both loaded and decoded. `decode()`
  // forces the decode up front so revealing the image can't flash; fall back to
  // a plain reveal where it's unsupported or rejects (e.g. the src changed).
  const onImageLoad = useCallback(() => {
    measureBaseDims();
    const img = imgRef.current;
    if (img && typeof img.decode === "function") {
      img.decode().then(
        () => setFullLoaded(true),
        () => setFullLoaded(true),
      );
    } else {
      setFullLoaded(true);
    }
  }, [measureBaseDims, imgRef]);

  // Don't strand the open on a broken image: reveal it (skipping the zoom) so
  // the spinner clears and the viewer stays usable.
  const onImageError = useCallback(() => setFullLoaded(true), []);

  // A cached image can already be `complete` before React wires up onLoad; pick
  // it up on mount so the open isn't stuck waiting for an event that won't fire.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) onImageLoad();
    // Mount-only: the opening image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the image is decoded, play the entry zoom (a no-op for non-zoom opens,
  // reduced motion, or a repeat call — all guarded inside runZoomEntry).
  useLayoutEffect(() => {
    if (fullLoaded) runZoomEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullLoaded]);

  // Reveal the spinner only after the wait crosses 500ms, then clear it the
  // moment the image is ready (or the gate no longer applies).
  useEffect(() => {
    if (!gateEntry || fullLoaded) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 500);
    return () => clearTimeout(t);
  }, [gateEntry, fullLoaded]);

  const settleEntry = useCallback(() => {
    entryCleanupRef.current?.();
  }, []);

  const playCollapse = useCallback(() => {
    const reduce = prefersReducedMotion();
    // Collapse back into the source thumbnail when one exists, is still on
    // screen, and the image isn't zoomed (a zoomed image's box no longer
    // matches the thumbnail; an off-screen thumbnail would fly to nowhere, so
    // fall back to the plain fade).
    const origin = !reduce && !isZoomed ? resolveOrigin(getOrigin?.(index)) : null;
    const thumb = origin && isRectInViewport(origin.rect) ? origin.rect : null;
    const img = imgRef.current;
    if (!thumb || !canAnimate(img)) return;

    const imgRect = img.getBoundingClientRect();
    // Lift the wrapper clip so the image isn't sliced as it flies back to the
    // thumbnail; the component unmounts at onClose, so no restore is needed.
    const wrapper = imgWrapperRef.current;
    if (wrapper) wrapper.style.overflow = "visible";
    setCollapsing(true);
    // Morph the corners from the image's own resting radius into the thumbnail's
    // over the flight so the rounding tracks the collapse instead of flattening
    // as the image shrinks (the FLIP scales border-radius down with it) and
    // snapping back on hand-off. When the origin is an element we land exactly on
    // the thumbnail's real radius; otherwise we hold the image's own. The
    // thumbnail-pose keyframe is scale-compensated so it renders at the target.
    const restRadius = parseFloat(getComputedStyle(img).borderRadius) || 0;
    const thumbRadius = origin!.radius ?? restRadius;
    const sx = thumb.width / imgRect.width;
    const sy = thumb.height / imgRect.height;
    const rounds = restRadius || thumbRadius;
    const radiusFrom = rounds ? { borderRadius: `${restRadius}px` } : {};
    const radiusTo = rounds ? { borderRadius: scaledRadius(thumbRadius, sx, sy) } : {};
    // fill "forwards" holds the collapsed pose until the component unmounts.
    img.animate(
      [
        { transformOrigin: "top left", transform: "none", ...radiusFrom },
        { transformOrigin: "top left", transform: flipTransform(imgRect, thumb), ...radiusTo },
      ],
      { duration: ANIM_MS, easing: ZOOM_EASE, fill: "forwards" },
    );
  }, [getOrigin, index, isZoomed, imgRef, imgWrapperRef]);

  return {
    gateEntry,
    zoomTransition,
    fullLoaded,
    showSpinner,
    collapsing,
    onImageLoad,
    onImageError,
    settleEntry,
    playCollapse,
  };
}
