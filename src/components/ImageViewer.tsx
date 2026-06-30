import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ImageViewerProps, ViewerContext, ViewerRect } from "../types";
import { useImageZoomPan, MIN_SCALE, MAX_SCALE } from "../hooks/useImageZoomPan";
import { useSlideNavigation } from "../hooks/useSlideNavigation";
import { useGestureHandler } from "../hooks/useGestureHandler";
import { useBarMeasure } from "../hooks/useBarMeasure";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { defaultIcons } from "./icons";
import { NavButton } from "./NavButton";
import { cx } from "./cx";

const ANIM_MS = 250;
const IMG_PADDING = 44;
// Decelerating ease for the shared-element zoom so it settles softly.
const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion(): boolean {
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

/**
 * Batteries-included fullscreen image viewer: zoom, pan, pinch, and swipe
 * navigation with themeable chrome and render slots. Controlled via `index` /
 * `onIndexChange`; mount it when open and it runs its own enter/exit animation,
 * calling `onClose` after the exit completes.
 */
export function ImageViewer<TData = unknown>({
  items,
  index,
  onIndexChange,
  onNavigate,
  onClose,
  getOriginRect,
  zoom = true,
  zoomToCursor = true,
  showCounter = true,
  loop = false,
  closeOnBackdropClick = false,
  renderHeader,
  renderHeaderActions,
  renderNavStart,
  renderNavEnd,
  renderFooter,
  renderOverlay,
  classNames,
  icons,
  ariaLabel,
}: ImageViewerProps<TData>) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  // True only while a thumbnail FLIP collapse is animating the image back into
  // its source. Keeps the track opaque for that flight; a close without a
  // collapse (zoomed, reduced motion, no origin rect) leaves it false so the
  // track fades out instead of vanishing on unmount.
  const [collapsing, setCollapsing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [contentShift, setContentShiftState] = useState<{
    transform: string | null;
    animate: boolean;
  }>({ transform: null, animate: true });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgWrapperRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );

  const item = items[index];

  const hasPrevLinear = index > 0;
  const hasNextLinear = index < items.length - 1;
  const hasPrev = loop ? items.length > 1 : hasPrevLinear;
  const hasNext = loop ? items.length > 1 : hasNextLinear;

  const mergedIcons = useMemo(() => ({ ...defaultIcons, ...icons }), [icons]);
  const cn = (slot: keyof NonNullable<ImageViewerProps["classNames"]>) => classNames?.[slot];

  useBodyScrollLock(true);
  useFocusTrap(containerRef, visible && !closing);
  const { topBarH, bottomBarH } = useBarMeasure(topBarRef, bottomBarRef, index);

  const zoomPan = useImageZoomPan(imgWrapperRef, index, zoom, zoomToCursor);
  const {
    imgRef,
    displayScale,
    isZoomed,
    transformRef,
    resetTransform,
    setTransform,
    clampTranslate,
    measureBaseDims,
    handleDoubleClick,
  } = zoomPan;

  const slide = useSlideNavigation(items, index, onIndexChange, onNavigate, loop);
  const { slideTrackRef, slideActive, slideAnimating, swipeOffset, commitSlide } = slide;

  const gestures = useGestureHandler(zoomPan, slide, hasPrev, hasNext, zoom, zoomToCursor);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- Shared-element thumbnail zoom ---------------------------------------
  // When `getOriginRect` is supplied the image expands out of its source
  // thumbnail on open and collapses back into it on close. Driven by the Web
  // Animations API on the <img> itself (zoom/pan owns the wrapper): WAAPI plays
  // from an explicit start keyframe and owns the transform for the animation's
  // duration, so React re-renders / the zoom-reset layout effect / frame timing
  // can't clobber it mid-flight (the failure mode of a raw inline transition).
  // The FLIP only ever scales down to ≤ 1, sidestepping the iOS upscale-clip bug
  // noted in useImageZoomPan.
  const zoomTransition = !!getOriginRect;
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
    if (!getOriginRect || prefersReducedMotion()) return;
    const img = imgRef.current;
    const thumb = getOriginRect(index);
    if (!thumb || !canAnimate(img)) return;

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
        { transformOrigin: "top left", transform: startTransform },
        { transformOrigin: "top left", transform: "none" },
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
  }, [getOriginRect, index, imgRef, imgWrapperRef, bottomBarRef]);

  // Mark the opening image ready once it has both loaded and decoded. `decode()`
  // forces the decode up front so revealing the image can't flash; fall back to
  // a plain reveal where it's unsupported or rejects (e.g. the src changed).
  const markFullLoaded = useCallback(() => {
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

  // A cached image can already be `complete` before React wires up onLoad; pick
  // it up on mount so the open isn't stuck waiting for an event that won't fire.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) markFullLoaded();
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

  const handleClose = useCallback(() => {
    const reduce = prefersReducedMotion();
    // Collapse back into the source thumbnail when one exists, is still on
    // screen, and the image isn't zoomed (a zoomed image's box no longer
    // matches the thumbnail; an off-screen thumbnail would fly to nowhere, so
    // fall back to the plain fade).
    const origin = !reduce && !isZoomed ? (getOriginRect?.(index) ?? null) : null;
    const thumb = origin && isRectInViewport(origin) ? origin : null;
    const img = imgRef.current;

    // If the open zoom is still playing, settle the image to its resting pose
    // first so the collapse measures the real box, not a mid-flight transform.
    entryCleanupRef.current?.();

    setClosing(true);
    setVisible(false);

    if (thumb && canAnimate(img)) {
      const imgRect = img.getBoundingClientRect();
      // Lift the wrapper clip so the image isn't sliced as it flies back to the
      // thumbnail; the component unmounts at onClose, so no restore is needed.
      const wrapper = imgWrapperRef.current;
      if (wrapper) wrapper.style.overflow = "visible";
      setCollapsing(true);
      // fill "forwards" holds the collapsed pose until the component unmounts.
      img.animate(
        [
          { transformOrigin: "top left", transform: "none" },
          { transformOrigin: "top left", transform: flipTransform(imgRect, thumb) },
        ],
        { duration: ANIM_MS, easing: ZOOM_EASE, fill: "forwards" },
      );
    }
    // Otherwise the backdrop/bars/track simply fade out (default close).

    setTimeout(onClose, reduce ? 0 : ANIM_MS);
  }, [onClose, getOriginRect, index, isZoomed, imgRef, imgWrapperRef]);

  const navigate = useCallback(
    (dir: "prev" | "next") => {
      // commitSlide plays the three-slot slide and wraps the index itself when
      // looping, so boundary wraps animate in exactly like an interior move.
      if (dir === "prev") {
        if (hasPrev) commitSlide("prev");
      } else {
        if (hasNext) commitSlide("next");
      }
    },
    [hasPrev, hasNext, commitSlide],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (displayScale > 1) return;
      if (e.key === "ArrowLeft" && hasPrev) navigate("prev");
      if (e.key === "ArrowRight" && hasNext) navigate("next");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose, hasPrev, hasNext, displayScale, navigate]);

  const setContentShift = useCallback((transform: string | null, animate = true) => {
    setContentShiftState({ transform, animate });
  }, []);

  const ctx: ViewerContext<TData> = {
    items,
    index,
    item: item!,
    total: items.length,
    hasPrev,
    hasNext,
    goPrev: () => navigate("prev"),
    goNext: () => navigate("next"),
    goTo: (i: number) => {
      if (i !== index && i >= 0 && i < items.length) onIndexChange(i);
    },
    close: handleClose,
    isZoomed,
    displayScale,
    zoomIn: () => {
      const t = transformRef.current;
      const next = Math.min(MAX_SCALE, t.scale * 1.3);
      const clamped = clampTranslate(t.x, t.y, next);
      setTransform({ scale: next, ...clamped }, true);
    },
    zoomOut: () => {
      const t = transformRef.current;
      const next = Math.max(MIN_SCALE, t.scale / 1.3);
      const clamped = next <= 1 ? { x: 0, y: 0 } : clampTranslate(t.x, t.y, next);
      setTransform({ scale: next, ...clamped }, true);
    },
    resetZoom: resetTransform,
    isTouchDevice,
    topBarHeight: topBarH,
    bottomBarHeight: bottomBarH,
    setContentShift,
  };

  if (!item) return null;

  const reservedH = bottomBarH + IMG_PADDING * 2;
  const imgMaxHeight = `calc(100vh - ${reservedH}px)`;
  const imgStyle: React.CSSProperties = { maxHeight: imgMaxHeight };
  // Keep the image hidden (but laid out, so the zoom can still measure its box)
  // until the full source has decoded, so the entry plays from the thumbnail
  // with no full-size flash. opacity, not display, to preserve the layout box.
  if (gateEntry && !fullLoaded) imgStyle.opacity = 0;

  const totalDigits = String(items.length).length;
  const counterMinWidth = `${totalDigits * 2 * 0.6 + 1.5}em`;

  // Three-slot carousel neighbors. When looping, the slots at the ends point at
  // the wrap-around items (last ↔ first) so the wrapping slide has a real image
  // to reveal instead of an empty panel.
  const prevIndex = hasPrevLinear ? index - 1 : hasPrev ? items.length - 1 : -1;
  const nextIndex = hasNextLinear ? index + 1 : hasNext ? 0 : -1;
  const prevItem = prevIndex >= 0 ? items[prevIndex] : null;
  const nextItem = nextIndex >= 0 ? items[nextIndex] : null;
  const showAdjacent = slideActive || slideAnimating || swipeOffset !== 0;
  const adjacentOpacity = Math.min(1, Math.abs(swipeOffset) / (viewportWidth * 0.8 || 1));

  const showZoomControls = zoom && !isTouchDevice;
  const headerActions = renderHeaderActions?.(ctx);
  const navStart = renderNavStart?.(ctx);
  const navEnd = renderNavEnd?.(ctx);
  const hasNavGroup = hasPrev || hasNext;
  const showNavRow = !isZoomed && (hasNavGroup || navStart != null || navEnd != null);

  return (
    <div
      ref={containerRef}
      className={cx("rvl-root", visible && !closing && "rvl-visible", cn("root"))}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? item.alt ?? "Image viewer"}
      tabIndex={-1}
    >
      <div
        className={cx("rvl-backdrop", cn("backdrop"))}
        onClick={closeOnBackdropClick ? handleClose : undefined}
        aria-hidden="true"
      />

      <div ref={topBarRef} className={cx("rvl-bar", "rvl-top-bar", cn("topBar"))}>
        <div className={cx("rvl-header", cn("topBar"))}>{renderHeader?.(ctx)}</div>

        <div className="rvl-header-actions">
          {headerActions}

          {showZoomControls && isZoomed && (
            <button
              type="button"
              className={cx("rvl-btn", "rvl-btn-scale", cn("button"))}
              onClick={(e) => {
                e.stopPropagation();
                resetTransform();
              }}
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              {Math.round(displayScale * 100)}%
            </button>
          )}

          {showZoomControls && (
            <button
              type="button"
              className={cx("rvl-btn", cn("button"))}
              onClick={(e) => {
                e.stopPropagation();
                ctx.zoomIn();
              }}
              title="Zoom in"
              aria-label="Zoom in"
            >
              {mergedIcons.zoomIn}
            </button>
          )}

          {showZoomControls && (
            <button
              type="button"
              className={cx("rvl-btn", cn("button"))}
              onClick={(e) => {
                e.stopPropagation();
                ctx.zoomOut();
              }}
              title="Zoom out"
              aria-label="Zoom out"
            >
              {mergedIcons.zoomOut}
            </button>
          )}

          <button
            type="button"
            className={cx("rvl-btn", cn("button"))}
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            title="Close (Esc)"
            aria-label="Close"
          >
            {mergedIcons.close}
          </button>
        </div>
      </div>

      <div
        className="rvl-stage"
        // The stage (z-index 10) sits over the backdrop (z-index 0) and captures
        // its clicks, so the backdrop's own handler can't fire. Close from here
        // when the click lands on the stage itself — the image wrapper stops
        // propagation and the track/adjacent layers are pointer-events:none, so
        // only genuine background clicks reach this guard.
        onClick={
          closeOnBackdropClick
            ? (e) => {
                if (e.target === e.currentTarget) handleClose();
              }
            : undefined
        }
        style={{
          transform: contentShift.transform ?? "translateY(0)",
          // animate=false snaps with no transition (overrides the CSS transition)
          transition: contentShift.animate ? undefined : "none",
        }}
      >
        <div
          ref={slideTrackRef}
          className={cx(
            "rvl-track",
            // During a thumbnail zoom the track is opaque from the first frame
            // (the image itself is hidden until the zoom starts), so the picture
            // flies in crisply instead of cross-fading. On close it only stays
            // opaque while a FLIP collapse is animating the image back; otherwise
            // it fades out (so a zoomed close still animates instead of vanishing).
            (closing ? collapsing : zoomTransition || visible) && "rvl-track-visible",
          )}
        >
          {showAdjacent && prevItem && (
            <div
              className="rvl-adjacent"
              style={{ transform: `translateX(-${viewportWidth}px)`, opacity: adjacentOpacity }}
            >
              <img
                src={prevItem.src}
                alt=""
                className={cx("rvl-img", cn("image"))}
                style={imgStyle}
                draggable={false}
              />
            </div>
          )}

          <div
            ref={imgWrapperRef}
            className="rvl-img-wrapper"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleDoubleClick}
            onPointerDown={gestures.handlePointerDown}
            onPointerMove={gestures.handlePointerMove}
            onPointerUp={gestures.handlePointerUp}
            onPointerLeave={gestures.handlePointerUp}
            onTouchStart={gestures.handleTouchStart}
            onTouchMove={gestures.handleTouchMove}
            onTouchEnd={gestures.handleTouchEnd}
          >
            <img
              ref={imgRef}
              src={item.src}
              alt={item.alt ?? ""}
              className={cx("rvl-img", cn("image"))}
              style={imgStyle}
              draggable={false}
              onLoad={markFullLoaded}
              // Don't strand the open on a broken image: reveal it (skipping the
              // zoom) so the spinner clears and the viewer stays usable.
              onError={() => setFullLoaded(true)}
            />
          </div>

          {gateEntry && showSpinner && !fullLoaded && (
            <div className={cx("rvl-spinner", cn("spinner"))} role="status" aria-label="Loading">
              <span className="rvl-spinner-ring" aria-hidden="true" />
            </div>
          )}

          {showAdjacent && nextItem && (
            <div
              className="rvl-adjacent"
              style={{ transform: `translateX(${viewportWidth}px)`, opacity: adjacentOpacity }}
            >
              <img
                src={nextItem.src}
                alt=""
                className={cx("rvl-img", cn("image"))}
                style={imgStyle}
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>

      <div ref={bottomBarRef} className={cx("rvl-bar", "rvl-bottom-bar", cn("bottomBar"))}>
        {showNavRow && (
          <div className="rvl-nav-row">
            <div className="rvl-nav-inner">
              {navStart != null && (
                <div className={cx("rvl-nav-start", cn("navStart"))}>{navStart}</div>
              )}
              {hasNavGroup && (
                <div className="rvl-nav-group">
                  <NavButton
                    direction="prev"
                    enabled={hasPrev}
                    onClick={() => navigate("prev")}
                    icon={mergedIcons.prev}
                    className={cn("navButton")}
                  />
                  {showCounter && (
                    <span
                      className={cx("rvl-counter", cn("counter"))}
                      style={{ minWidth: counterMinWidth }}
                    >
                      {index + 1} / {items.length}
                    </span>
                  )}
                  <NavButton
                    direction="next"
                    enabled={hasNext}
                    onClick={() => navigate("next")}
                    icon={mergedIcons.next}
                    className={cn("navButton")}
                  />
                </div>
              )}
              {navEnd != null && <div className={cx("rvl-nav-end", cn("navEnd"))}>{navEnd}</div>}
            </div>
          </div>
        )}

        {renderFooter && <div className="rvl-footer">{renderFooter(ctx)}</div>}
      </div>

      {renderOverlay && (
        <div className={cx("rvl-overlay", cn("overlay"))}>{renderOverlay(ctx)}</div>
      )}
    </div>
  );
}
