import { useCallback, useLayoutEffect, useEffect, useRef, useState, type RefObject } from "react";
import type { ViewerItem, ViewerRect } from "../types";
import { prefetchItem } from "../prefetch";
import {
  coverRect,
  cropFadeProgress,
  cropFeather,
  cropInsets,
  cropMask,
  cropsAnything,
  parseObjectPosition,
  type Insets,
} from "./math";

// Duration of the shared-element zoom (open expand / close collapse) in ms.
export const ANIM_MS = 250;
// Vertical breathing room reserved around the image, per side, in px.
export const IMG_PADDING = 44;
// Decelerating ease for the shared-element zoom so it settles softly.
const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// Samples of the cropped-thumbnail fade; ~20ms apart, so finer than a frame.
const CROP_FADE_STEPS = 12;

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
  /**
   * The window the thumbnail leaves open on {@link rect} when it CROPS its
   * image, and `rect` is therefore larger than the thumbnail itself. Null when
   * the thumbnail shows its whole image, which is when the two are the same box.
   */
  clip: ViewerRect | null;
}

/**
 * The rect a cropping thumbnail's flight should target, and the window it
 * leaves open on it — or null when the element isn't cropping anything.
 *
 * A thumbnail with `object-fit: cover` over it shows a SLICE of its image, so
 * its own box is the wrong target: flying an uncropped image into it squashes
 * the picture for the length of the animation, hardest on exactly the images
 * the crop works hardest on. The right target is the rect the whole image would
 * occupy at the crop's own scale — the slice on screen still lines up with the
 * thumbnail, and the flight stays in proportion the whole way.
 */
function resolveCrop(el: HTMLElement): { rect: ViewerRect; clip: ViewerRect } | null {
  const img = el.querySelector("img");
  if (!img) return null;
  const style = getComputedStyle(img);
  if (style.objectFit !== "cover") return null;
  const { naturalWidth, naturalHeight } = img;
  // The img's own box rather than the element's: a thumbnail may carry a border,
  // and it is the painted image the crop is cut from.
  const box = img.getBoundingClientRect();
  if (!naturalWidth || !naturalHeight || !box.width || !box.height) return null;
  const rect = coverRect(
    box,
    { width: naturalWidth, height: naturalHeight },
    parseObjectPosition(style.objectPosition),
  );
  return { rect, clip: box };
}

/**
 * Normalize a `getOrigin` result. An element yields its on-screen rect and its
 * computed corner radius (so the zoom can match the thumbnail's rounding
 * exactly), plus — where the element crops its image — the wider rect the
 * flight should target and the window the crop leaves open on it. A bare
 * {@link ViewerRect} yields the rect with an unknown radius (the zoom falls
 * back to the image's own) and no crop, since there is no element to read one
 * from. Element-ness is duck-typed on `getBoundingClientRect` so a plain rect
 * object never trips it.
 */
function resolveOrigin(
  src: HTMLElement | ViewerRect | null | undefined,
  crop: boolean,
): ResolvedOrigin | null {
  if (!src) return null;
  if (typeof (src as HTMLElement).getBoundingClientRect === "function") {
    const el = src as HTMLElement;
    const cropped = crop ? resolveCrop(el) : null;
    return {
      rect: cropped ? cropped.rect : el.getBoundingClientRect(),
      radius: parseFloat(getComputedStyle(el).borderRadius) || 0,
      clip: cropped ? cropped.clip : null,
    };
  }
  return { rect: src as ViewerRect, radius: null, clip: null };
}

/**
 * Fade the cropped-away strip of a flying image in or out across the flight.
 *
 * Landing on the cover rect (see {@link resolveCrop}) leaves the parts the
 * thumbnail crops off painted on screen — at the end of a collapse, where they
 * blink out with the viewer a frame later, and from the first frame of an
 * expand, where they appear out of nowhere. Neither reads as the flight; both
 * read as a glitch. So they fade, on a mask that holds still while its opacity
 * goes, sampled into keyframes because the curve isn't one CSS can express.
 *
 * Returns the animation so the caller can tear it down, or null when the
 * thumbnail crops nothing and there is no strip to fade.
 */
function playCropFade(
  img: HTMLImageElement,
  rest: ViewerRect,
  origin: ResolvedOrigin,
  direction: "expand" | "collapse",
): Animation | null {
  if (!origin.clip || !rest.width || !rest.height) return null;
  const insets: Insets = cropInsets(rest, origin.rect, origin.clip);
  if (!cropsAnything(insets)) return null;

  const size = { width: rest.width, height: rest.height };
  const feather = cropFeather(insets);
  const frames = Array.from({ length: CROP_FADE_STEPS + 1 }, (_, i) => {
    const u = i / CROP_FADE_STEPS;
    const mask = cropMask(insets, size, cropFadeProgress(u, direction), feather);
    return { offset: u, maskImage: mask, webkitMaskImage: mask };
  });
  // Linear between the samples: an even fade is the point, and the flight's own
  // decelerating ease run over the top of it front-loads the whole thing into
  // the first few frames, which is the lurch this exists to avoid.
  return img.animate(frames, { duration: ANIM_MS, easing: "linear", fill: "forwards" });
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

/** Two rects differ by more than a pixel on any edge. */
function rectsDiffer(a: ViewerRect, b: ViewerRect): boolean {
  return (
    Math.abs(a.left - b.left) > 1 ||
    Math.abs(a.top - b.top) > 1 ||
    Math.abs(a.width - b.width) > 1 ||
    Math.abs(a.height - b.height) > 1
  );
}

function sameUrl(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return new URL(a, document.baseURI).href === new URL(b, document.baseURI).href;
  } catch {
    return false;
  }
}

/**
 * A low-res source that can stand in for the opening image while its full
 * source loads: the origin element's own `<img>` when it has already loaded
 * (it's on screen, so it's decoded and costs nothing), else the item's
 * `thumbnail`. Null when there's nothing, or when it IS the full source (a
 * gallery that tiles with its full images gains nothing from a swap).
 */
function resolvePlaceholder(
  getOrigin: SharedElementZoomArgs["getOrigin"],
  index: number,
  item: ViewerItem | undefined,
): string | null {
  if (typeof window === "undefined" || !item) return null;
  let src: string | null = null;
  const origin = getOrigin?.(index, item);
  if (origin && typeof (origin as HTMLElement).getBoundingClientRect === "function") {
    const el = origin as HTMLElement;
    const img = el instanceof HTMLImageElement ? el : el.querySelector("img");
    if (img && img.complete && img.naturalWidth > 0) src = img.currentSrc || img.src || null;
  }
  if (!src && item.thumbnail) src = item.thumbnail;
  if (!src || sameUrl(src, item.src)) return null;
  return src;
}

export interface SharedElementZoomArgs {
  getOrigin?: (index: number, item: ViewerItem) => HTMLElement | ViewerRect | null;
  /** The active item; its `thumbnail` (or the origin's loaded `<img>`) seeds the placeholder. */
  item: ViewerItem | undefined;
  /** Honor a source element's `object-fit: cover` crop. Default `true`. */
  crop?: boolean;
  index: number;
  isZoomed: boolean;
  imgRef: RefObject<HTMLImageElement | null>;
  imgWrapperRef: RefObject<HTMLDivElement | null>;
  bottomBarRef: RefObject<HTMLDivElement | null>;
  /** CSS length term for the height the image is sized against (see `useViewportHeight`). */
  viewportH: string;
  measureBaseDims: () => void;
}

export interface SharedElementZoomState {
  /** True when the open should hold the image hidden until it decodes, then play the zoom. */
  gateEntry: boolean;
  /**
   * The gated entry is over: its zoom finished (or was settled early), or it
   * turned out it couldn't play (no origin, image off screen). Only meaningful
   * when {@link gateEntry} is true.
   */
  entrySettled: boolean;
  /**
   * Low-res stand-in to render as the active image's `src` (with no
   * `srcSet`/`sizes`) while the full image loads; null once swapped, after
   * navigating away from the opening item, or when there is none.
   */
  placeholderSrc: string | null;
  /** Keep the active image at opacity 0 for now (it isn't ready to be seen). */
  holdHidden: boolean;
  /** True when a shared-element (thumbnail) zoom is configured at all. */
  zoomTransition: boolean;
  /** Whether the opening image has finished loading + decoding. */
  fullLoaded: boolean;
  /** True once a load (the gated image, or the full image behind a placeholder) runs long. */
  showSpinner: boolean;
  /** True only while a close-collapse FLIP is animating the image back into its source. */
  collapsing: boolean;
  /** `<img onLoad>` handler: measures base dims and marks the image ready once decoded. */
  onImageLoad: () => void;
  /**
   * `<img onError>` handler: settles the open so it isn't stranded on a broken
   * image. Returns false when only the placeholder failed (the full image then
   * loads in its place), true when the image itself did.
   */
  onImageError: () => boolean;
  /** Settle an in-flight entry zoom to its resting pose (call before measuring a close). */
  settleEntry: () => void;
  /**
   * Play the collapse-into-thumbnail FLIP on close, when one applies. Returns
   * true when it played, false when the close falls back to a plain fade.
   */
  playCollapse: () => boolean;
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
  item,
  crop = true,
  index,
  isZoomed,
  imgRef,
  imgWrapperRef,
  bottomBarRef,
  viewportH,
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

  // Thumbnail-first open. The opening item shows a low-res stand-in (see
  // resolvePlaceholder) the moment it mounts, sized to the box the full image
  // will rest in, so the entry zoom plays at once instead of waiting on the
  // network. The full image is fetched + decoded off-DOM meanwhile, then
  // swapped into the same <img> (decoded, so the swap is atomic). Resolved in
  // the initializer so the very first render already uses it: the full src
  // never starts loading into the element only to be replaced.
  const openIndexRef = useRef(index);
  const [placeholderState, setPlaceholderState] = useState<string | null>(() =>
    resolvePlaceholder(getOrigin, index, item),
  );
  const placeholderSrc = index === openIndexRef.current ? placeholderState : null;
  const placeholderRef = useRef(placeholderSrc);
  useLayoutEffect(() => {
    placeholderRef.current = placeholderSrc;
  });
  // The full image (behind a placeholder) has decoded and can be swapped in.
  const [fullReady, setFullReady] = useState(false);
  // The <img> carries explicit px width/height sized from the placeholder.
  const sizedRef = useRef(false);
  // A size release that arrived mid-entry-zoom, to run when the flight ends.
  const releaseAfterEntryRef = useRef(false);

  const entryStartedRef = useRef(false);
  // The opening image failed: there is nothing to fly in from the thumbnail.
  const failedRef = useRef(false);
  const [entrySettled, setEntrySettled] = useState(false);
  // Tears down the in-flight entry zoom (clears the inline transform, restores
  // the wrapper clip, cancels the animation). Set while the zoom is playing so
  // a close mid-flight can settle the image before measuring its collapse.
  const entryCleanupRef = useRef<(() => void) | null>(null);

  // The CSS caps the image at (max-width, max-height); a placeholder is smaller
  // than the full image, so left to its natural size it would rest small and
  // then jump on the swap. Pin the box the full image will fill instead: the
  // placeholder's aspect, scaled to fit the caps. That assumes the full image is
  // at least as large as that box (true for photos); one that's smaller is
  // corrected, with a short glide, when its own load releases the pin.
  const sizeToPlaceholder = useCallback(
    (img: HTMLImageElement) => {
      const { naturalWidth: nw, naturalHeight: nh } = img;
      if (!nw || !nh) return;
      // Lock to the final constrained height, as runZoomEntry does (the bottom
      // bar may not be measured into React state yet on the opening frame).
      const bottomH = bottomBarRef.current?.offsetHeight ?? 0;
      img.style.maxHeight = `calc(${viewportH} - ${bottomH + IMG_PADDING * 2}px)`;
      const cs = getComputedStyle(img);
      const px = (v: string, fallback: number) =>
        v.endsWith("px") && Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback;
      const maxW = px(cs.maxWidth, window.innerWidth);
      const maxH = px(cs.maxHeight, window.innerHeight);
      const scale = Math.min(maxW / nw, maxH / nh);
      img.style.width = `${nw * scale}px`;
      img.style.height = `${nh * scale}px`;
      sizedRef.current = true;
    },
    [bottomBarRef, viewportH],
  );

  // Drop the placeholder-derived size pin once the full image is in, letting it
  // take its own size. Deferred while the entry zoom is in flight (resizing the
  // element under a running FLIP would jolt it); otherwise any change glides.
  const releaseSize = useCallback(() => {
    const img = imgRef.current;
    if (!img || !sizedRef.current) return;
    if (entryCleanupRef.current) {
      releaseAfterEntryRef.current = true;
      return;
    }
    sizedRef.current = false;
    const before = img.getBoundingClientRect();
    img.style.width = "";
    img.style.height = "";
    const after = img.getBoundingClientRect();
    if (!isZoomed && !prefersReducedMotion() && canAnimate(img) && after.width && after.height) {
      if (rectsDiffer(before, after)) {
        img.animate(
          [
            { transformOrigin: "top left", transform: flipTransform(after, before) },
            { transformOrigin: "top left", transform: "none" },
          ],
          { duration: ANIM_MS, easing: ZOOM_EASE },
        );
      }
    }
    measureBaseDims();
  }, [imgRef, isZoomed, measureBaseDims]);
  const releaseSizeRef = useRef(releaseSize);
  useLayoutEffect(() => {
    releaseSizeRef.current = releaseSize;
  });

  // Plays the shared-element zoom once, from the source thumbnail to the resting
  // image box. Only ever invoked after the full image has decoded (see below),
  // so the picture is paint-ready and the zoom can't flash a full-size frame.
  const runZoomEntry = useCallback(() => {
    if (entryStartedRef.current) return;
    if (!getOrigin || prefersReducedMotion() || !item || failedRef.current) {
      setEntrySettled(true);
      return;
    }
    const img = imgRef.current;
    const origin = resolveOrigin(getOrigin(index, item), crop);
    if (!origin || !canAnimate(img)) {
      setEntrySettled(true);
      return;
    }
    const thumb = origin.rect;

    // Pin the image to its final constrained height before measuring. The bottom
    // bar is measured in a post-paint effect, so on the opening frame `bottomBarH`
    // is still 0 and the React-driven maxHeight is too tall; locking it here (read
    // straight from the bar's DOM) keeps a late bottomBarH measurement from
    // resizing the image mid-flight, which is what makes the open animation
    // visibly jump / re-expand. Held for the whole flight, then matched to React's
    // now-settled value on finish.
    const bottomH = bottomBarRef.current?.offsetHeight ?? 0;
    const lockedMaxHeight = `calc(${viewportH} - ${bottomH + IMG_PADDING * 2}px)`;
    img.style.maxHeight = lockedMaxHeight;

    const imgRect = img.getBoundingClientRect();
    // A zero box can't be flown, and an image off screen (the stage pushed out
    // of view by a shifted-open overlay) has nowhere visible to fly to.
    if (imgRect.width === 0 || imgRect.height === 0 || !isRectInViewport(imgRect)) {
      img.style.maxHeight = "";
      setEntrySettled(true);
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
    // Where the thumbnail crops, the image starts out showing only the slice the
    // thumbnail shows and the rest fades up as it flies, rather than the whole
    // picture being there from the first frame, overflowing a thumbnail that
    // never showed that much of it.
    const fade = playCropFade(img, imgRect, origin, "expand");
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
      // Release the mask too: a held fill would leave the resting image masked,
      // and a close mid-flight starts a fade of its own on the same property.
      fade?.cancel();
      img.style.maskImage = "";
      img.style.webkitMaskImage = "";
      entryCleanupRef.current = null;
      setEntrySettled(true);
      if (releaseAfterEntryRef.current) {
        releaseAfterEntryRef.current = false;
        releaseSizeRef.current();
      }
    };
    entryCleanupRef.current = cleanup;
    anim.onfinish = cleanup;
  }, [getOrigin, index, item, crop, imgRef, imgWrapperRef, bottomBarRef, viewportH]);

  // Mark the opening image ready once it has both loaded and decoded. `decode()`
  // forces the decode up front so revealing the image can't flash; fall back to
  // a plain reveal where it's unsupported or rejects (e.g. the src changed).
  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    // The placeholder's first load sizes the box; the full image's load (after
    // the swap) releases that pin.
    if (img && placeholderRef.current) {
      if (!sizedRef.current) sizeToPlaceholder(img);
    } else if (sizedRef.current) {
      releaseSize();
    }
    measureBaseDims();
    if (img && typeof img.decode === "function") {
      img.decode().then(
        () => setFullLoaded(true),
        () => setFullLoaded(true),
      );
    } else {
      setFullLoaded(true);
    }
  }, [measureBaseDims, imgRef, sizeToPlaceholder, releaseSize]);

  // Don't strand the open on a broken image: settle it (skipping the zoom) so
  // the spinner clears and the viewer can show its error state. A placeholder
  // that fails is just dropped, and the full image loads in its place.
  const onImageError = useCallback(() => {
    if (placeholderRef.current) {
      setPlaceholderState(null);
      return false;
    }
    if (!fullLoaded) failedRef.current = true;
    setFullLoaded(true);
    return true;
  }, [fullLoaded]);

  // Fetch + decode the full opening image off-DOM while the placeholder shows.
  // prefetchItem mirrors srcset/sizes so the browser picks the same candidate
  // the <img> will, and shares a request a tile hover may already have started.
  // Mount-only: the placeholder belongs to the opening item.
  useEffect(() => {
    if (!placeholderState || !item) return;
    let cancelled = false;
    prefetchItem(item).then(() => {
      if (!cancelled) setFullReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the full image in as soon as it's decoded.
  useEffect(() => {
    if (fullReady && placeholderState) setPlaceholderState(null);
  }, [fullReady, placeholderState]);

  // Navigating off the opening item drops its placeholder (see `placeholderSrc`)
  // and must drop the size pin with it, before the next item paints.
  useLayoutEffect(() => {
    if (index === openIndexRef.current) return;
    // For good: coming back to the opening item shows its full image.
    openIndexRef.current = -1;
    setPlaceholderState(null);
    const img = imgRef.current;
    if (img && sizedRef.current) {
      sizedRef.current = false;
      releaseAfterEntryRef.current = false;
      img.style.width = "";
      img.style.height = "";
    }
  }, [index, imgRef]);

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

  // Hidden until there's something decoded to show: the gated thumbnail zoom
  // (which flies in once ready), or a placeholder that hasn't sized yet.
  const holdHidden = (gateEntry || !!placeholderSrc) && !fullLoaded;
  // Waiting on the network: the opening image hasn't loaded (on any open path,
  // with or without getOrigin — a plain deep-linked open of a large image is
  // just as slow), or a placeholder is showing and the full image is still on
  // its way. `holdHidden` implies `!fullLoaded`.
  const waiting = !fullLoaded || (!!placeholderSrc && !fullReady);

  // Reveal the spinner only after the wait crosses 500ms, then clear it the
  // moment the wait ends.
  useEffect(() => {
    if (!waiting) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 500);
    return () => clearTimeout(t);
  }, [waiting]);

  const settleEntry = useCallback(() => {
    entryCleanupRef.current?.();
  }, []);

  const playCollapse = useCallback((): boolean => {
    const reduce = prefersReducedMotion();
    // Collapse back into the source thumbnail when one exists, is still on
    // screen, and the image isn't zoomed (a zoomed image's box no longer
    // matches the thumbnail; an off-screen thumbnail would fly to nowhere, so
    // fall back to the plain fade).
    const origin =
      !reduce && !isZoomed && item ? resolveOrigin(getOrigin?.(index, item), crop) : null;
    const thumb = origin && isRectInViewport(origin.rect) ? origin.rect : null;
    const img = imgRef.current;
    if (!origin || !thumb || !canAnimate(img)) return false;

    const visual = img.getBoundingClientRect();
    // The image itself must be on screen too: with the stage pushed out of view
    // (a drawer open), a collapse would fly it in from off-screen. Fade instead.
    if (!isRectInViewport(visual) || !visual.width || !visual.height) return false;

    // A swipe-to-close leaves the wrapper carrying its drag pose (a translate
    // plus a uniform scale), and the image's own animation plays INSIDE that
    // transform. Map every target through it: measure the image's untransformed
    // box, derive the pose from the two rects, and express the thumbnail in the
    // wrapper's local space. With no carried transform this is the identity.
    const wrapper = imgWrapperRef.current;
    let rest = visual;
    let toLocal = (r: ViewerRect): ViewerRect => r;
    const carried = wrapper?.style.transform;
    if (wrapper && carried && carried !== "none") {
      wrapper.style.transform = "none";
      rest = img.getBoundingClientRect();
      wrapper.style.transform = carried;
      const s = visual.width / rest.width || 1;
      toLocal = (r) => ({
        left: rest.left + (r.left - visual.left) / s,
        top: rest.top + (r.top - visual.top) / s,
        width: r.width / s,
        height: r.height / s,
      });
    }
    const poseScale = visual.width / rest.width || 1;
    const target = toLocal(thumb);
    const localOrigin: ResolvedOrigin = {
      ...origin,
      rect: toLocal(origin.rect),
      clip: origin.clip && toLocal(origin.clip),
    };

    // Lift the wrapper clip so the image isn't sliced as it flies back to the
    // thumbnail; the component unmounts at onClose, so no restore is needed.
    if (wrapper) wrapper.style.overflow = "visible";
    setCollapsing(true);
    // Morph the corners from the image's own resting radius into the thumbnail's
    // over the flight so the rounding tracks the collapse instead of flattening
    // as the image shrinks (the FLIP scales border-radius down with it) and
    // snapping back on hand-off. When the origin is an element we land exactly on
    // the thumbnail's real radius; otherwise we hold the image's own. The
    // thumbnail-pose keyframe is scale-compensated (for the carried pose too) so
    // it renders at the target.
    const restRadius = parseFloat(getComputedStyle(img).borderRadius) || 0;
    const thumbRadius = origin.radius ?? restRadius;
    const sx = (target.width / rest.width) * poseScale;
    const sy = (target.height / rest.height) * poseScale;
    const rounds = restRadius || thumbRadius;
    const radiusFrom = rounds ? { borderRadius: `${restRadius}px` } : {};
    const radiusTo = rounds ? { borderRadius: scaledRadius(thumbRadius, sx, sy) } : {};
    // fill "forwards" holds the collapsed pose until the component unmounts.
    img.animate(
      [
        { transformOrigin: "top left", transform: "none", ...radiusFrom },
        { transformOrigin: "top left", transform: flipTransform(rest, target), ...radiusTo },
      ],
      { duration: ANIM_MS, easing: ZOOM_EASE, fill: "forwards" },
    );
    // Where the thumbnail crops, take the parts it has no room for down to
    // nothing on the way, so there is nothing left to blink out when the viewer
    // unmounts on top of the landed image.
    playCropFade(img, rest, localOrigin, "collapse");
    return true;
  }, [getOrigin, index, item, isZoomed, crop, imgRef, imgWrapperRef]);

  return {
    gateEntry,
    entrySettled,
    placeholderSrc,
    holdHidden,
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
