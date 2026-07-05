import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ImageViewerProps, ViewerContext } from "../types";
import { useImageZoomPan, MIN_SCALE, MAX_SCALE } from "../hooks/useImageZoomPan";
import { useSlideNavigation } from "../hooks/useSlideNavigation";
import { useGestureHandler } from "../hooks/useGestureHandler";
import { useBarMeasure } from "../hooks/useBarMeasure";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useThemeColor } from "../hooks/useThemeColor";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  useSharedElementZoom,
  prefersReducedMotion,
  ANIM_MS,
  IMG_PADDING,
  VIEWPORT_H,
} from "../hooks/useSharedElementZoom";
import { defaultIcons } from "./icons";
import { NavButton } from "./NavButton";
import { ChromeButton } from "./ChromeButton";
import { cx } from "./cx";

// Window after open during which synthesized mouse click/dblclick are ignored.
// A tap (or double-tap) that opens the viewer fires iOS's synthesized `click` /
// `dblclick` a few hundred ms LATER — by which point this viewer has mounted
// under the finger, so they re-target onto it (the dblclick zooms the image,
// the click hits the backdrop and closes it). See GHOST guards below.
const GHOST_CLICK_MS = 700;

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
  onEscape,
  getOrigin,
  zoom = true,
  zoomToCursor = true,
  showCounter = true,
  showZoomControls = true,
  disableNavigation = false,
  loop = false,
  closeOnBackdropClick = false,
  renderHeader,
  renderHeaderActions,
  renderNavStart,
  renderNavEnd,
  navSlotPlacement = "edge",
  navHeight,
  navInset,
  counterFontSize,
  renderFooter,
  renderOverlay,
  renderImageOverlay,
  classNames,
  icons,
  ariaLabel,
}: ImageViewerProps<TData>) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [contentShift, setContentShiftState] = useState<{
    transform: string | null;
    animate: boolean;
  }>({ transform: null, animate: true });

  // Timestamp of this open, used to drop the iOS ghost click/dblclick that the
  // opening tap synthesizes onto the freshly mounted viewer (see GHOST_CLICK_MS).
  const openedAtRef = useRef(Date.now());
  const isGhostMouseEvent = useCallback(
    () => Date.now() - openedAtRef.current < GHOST_CLICK_MS,
    [],
  );

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

  // Release the scroll lock the instant the close begins — while the backdrop is
  // still opaque — rather than at unmount (after the fade), so the `position:
  // fixed` → static reflow it triggers on iOS Safari happens behind the cover
  // instead of blinking the revealed page. Held for the whole open lifetime
  // otherwise. Unlike the theme-color tint (kept to unmount so the chrome bands
  // don't flash mid-close), the scroll reflow is masked by the backdrop, so
  // releasing early is safe here.
  useBodyScrollLock(!closing);
  // Tint the iOS Safari chrome (status-bar / home-indicator bands) to the
  // overlay color instead of letting it sample the page behind the viewer. Held
  // for the whole mounted lifetime (like the scroll lock) so it isn't reverted
  // mid-close-animation, which would flash the page color into those bands.
  useThemeColor(true);
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
  const {
    slideTrackRef,
    prevPanelRef,
    nextPanelRef,
    slideActive,
    slideAnimating,
    slideDistance,
    commitSlide,
    refreshSlideDistance,
  } = slide;

  const gestures = useGestureHandler(zoomPan, slide, hasPrev, hasNext, zoom, zoomToCursor);

  // Shared-element thumbnail zoom: expand out of / collapse back into the source
  // thumbnail, plus load-gating + the delayed loading spinner. See the hook.
  const {
    gateEntry,
    zoomTransition,
    fullLoaded,
    showSpinner,
    collapsing,
    onImageLoad,
    onImageError,
    settleEntry,
    playCollapse,
  } = useSharedElementZoom({
    getOrigin,
    index,
    isZoomed,
    imgRef,
    imgWrapperRef,
    bottomBarRef,
    measureBaseDims,
  });

  useEffect(() => {
    // Only suppress the hover-only zoom buttons on touch-PRIMARY devices
    // (phones/tablets). Merely being touch-capable (a touchscreen laptop or
    // 2-in-1 driven by a mouse) reports maxTouchPoints > 0, which would wrongly
    // hide the controls even though the pointer can click them. `(hover: none)
    // and (pointer: coarse)` matches only devices whose primary input is touch.
    if (typeof window === "undefined" || !window.matchMedia) {
      setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
      return;
    }
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsTouchDevice(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Warm the neighbors: whenever the active index changes, kick off a background
  // fetch AND decode of the previous and next images so a swipe/nav to them
  // draws from the browser's caches instead of waiting on the network. The
  // adjacent <img> panels only mount mid-swipe, so without this the first frame
  // of a button/keyboard move (or a fresh swipe) hits the wire cold — and
  // without the decode() the first swipe frame pays the (main-thread-visible)
  // decode of a full-size photo right as the gesture starts. Warming runs at
  // low fetch priority so it never competes with the active image on a
  // constrained connection. We hold the Image objects until they settle so an
  // in-flight fetch isn't aborted by GC.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prevWarm = hasPrevLinear
      ? items[index - 1]
      : hasPrev
        ? items[items.length - 1]
        : undefined;
    const nextWarm = hasNextLinear ? items[index + 1] : hasNext ? items[0] : undefined;

    const loaders: HTMLImageElement[] = [];
    for (const warm of [prevWarm, nextWarm]) {
      if (!warm?.src) continue;
      const img = new Image();
      if ("fetchPriority" in img) img.fetchPriority = "low";
      // Mirror the panel <img>'s srcset/sizes so the warmed resource is the
      // one the browser will actually pick when the panel mounts.
      if (warm.srcSet) {
        img.srcset = warm.srcSet;
        if (warm.sizes) img.sizes = warm.sizes;
      }
      img.src = warm.src;
      const done = () => {
        const i = loaders.indexOf(img);
        if (i !== -1) loaders.splice(i, 1);
      };
      if (typeof img.decode === "function") {
        img.decode().then(done, done);
      } else {
        img.onload = done;
        img.onerror = done;
      }
      loaders.push(img);
    }

    return () => {
      // Drop refs on navigation; any completed fetch/decode stays cached.
      for (const img of loaders) {
        img.onload = null;
        img.onerror = null;
      }
      loaders.length = 0;
    };
  }, [items, index, hasPrev, hasNext, hasPrevLinear, hasNextLinear]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    const reduce = prefersReducedMotion();
    // If the open zoom is still playing, settle the image to its resting pose
    // first so the collapse measures the real box, not a mid-flight transform.
    settleEntry();

    setClosing(true);
    setVisible(false);

    // The collapse-into-thumbnail FLIP is played from the layout effect below,
    // *after* the `closing` commit releases the body scroll lock: releasing
    // `position: fixed` reflows the page (thumbnail back to its in-flow rect), so
    // measuring the collapse target here — before that reflow — would fly the
    // image to the locked-layout rect and then snap to the settled thumbnail on
    // unmount. Deferring lets the FLIP target the thumbnail's final resting box.
    setTimeout(onClose, reduce ? 0 : ANIM_MS);
  }, [onClose, settleEntry]);

  // Play the collapse once the close has committed and the scroll lock has
  // released. React runs layout-effect cleanups (the lock release) before
  // layout-effect setups, so by the time this fires the page has reflowed and
  // `playCollapse` measures the thumbnail's settled rect. A layout effect (not a
  // plain effect) keeps it pre-paint, so the FLIP starts on the same frame the
  // backdrop begins fading — no gap where the un-collapsed image is visible.
  useLayoutEffect(() => {
    if (closing) playCollapse();
    // `closing` only ever flips false→true (the viewer then unmounts), so this
    // runs the collapse exactly once. Intentionally not keyed on playCollapse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  // Touch-tap close for the backdrop/stage. On iOS a tap that closes the viewer
  // via the synthesized `click` also fires synthesized mouse events (mouseover /
  // mousemove) straight after; once the backdrop unmounts those re-target to
  // whatever element now sits under the finger — a thumbnail on the page behind —
  // leaving it stuck in `:hover` (the tap "falls through"). Closing on touchend
  // and calling preventDefault suppresses those synthesized events *and* the
  // follow-up click, so the tap stays contained to the viewer. The
  // target===currentTarget guard keeps swipes/taps on the image (which bubble up
  // from the wrapper) from triggering a close.
  const handleBackdropTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      handleClose();
    },
    [handleClose],
  );

  // The track spans the whole viewport and owns every swipe/pan/pinch, so a
  // gesture registers wherever it starts — including the empty space around a
  // letterboxed image (the image wrapper only covers the picture itself). It
  // doubles as the backdrop hit target: a stationary tap on the background
  // closes, but a swipe that merely happens to end over empty space must not.
  // `gestureMovedRef` tells the two apart; `target===currentTarget` limits close
  // to the background (taps on the image bubble up from the wrapper).
  const handleTrackTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      gestures.handleTouchEnd(e);
      if (!closeOnBackdropClick) return;
      if (e.target !== e.currentTarget) return;
      if (gestures.gestureMovedRef.current) return;
      e.preventDefault();
      handleClose();
    },
    [gestures, closeOnBackdropClick, handleClose],
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      if (isGhostMouseEvent()) return;
      if (gestures.gestureMovedRef.current) return;
      handleClose();
    },
    [gestures, isGhostMouseEvent, handleClose],
  );

  // Mouse double-click zoom, minus the iOS ghost dblclick from the opening tap
  // (which would land here and pop the just-opened image into a zoom state).
  const handleDoubleClickGuarded = useCallback(
    (e: React.MouseEvent) => {
      if (isGhostMouseEvent()) return;
      handleDoubleClick(e);
    },
    [handleDoubleClick, isGhostMouseEvent],
  );

  // Backdrop/stage click-to-close, minus the iOS ghost click from the opening
  // tap (which would land here and close the viewer the instant it opened).
  const handleBackdropClick = useCallback(() => {
    if (isGhostMouseEvent()) return;
    handleClose();
  }, [handleClose, isGhostMouseEvent]);

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
        // Let the consumer dismiss its own overlay first; only close when the
        // veto hook declines to handle the key.
        if (onEscape?.()) return;
        handleClose();
        return;
      }
      if (disableNavigation || displayScale > 1) return;
      if (e.key === "ArrowLeft" && hasPrev) navigate("prev");
      if (e.key === "ArrowRight" && hasNext) navigate("next");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose, hasPrev, hasNext, displayScale, navigate, onEscape, disableNavigation]);

  const setContentShift = useCallback((transform: string | null, animate = true) => {
    setContentShiftState({ transform, animate });
  }, []);

  const ctx: ViewerContext<TData> = {
    items,
    index,
    item: item!,
    total: items.length,
    closing,
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
  const imgMaxHeight = `calc(${VIEWPORT_H} - ${reservedH}px)`;
  const imgStyle: React.CSSProperties = { maxHeight: imgMaxHeight };

  // Numbers become px; strings pass through (e.g. "1.5rem"). Only emit vars that
  // were supplied so the stylesheet defaults still apply otherwise.
  const dim = (v: number | string) => (typeof v === "number" ? `${v}px` : v);
  const rootStyle: React.CSSProperties = {
    ...(navHeight != null && { "--rvl-nav-height": dim(navHeight) }),
    ...(navInset != null && { "--rvl-nav-inset": dim(navInset) }),
    ...(counterFontSize != null && { "--rvl-counter-font-size": dim(counterFontSize) }),
  } as React.CSSProperties;
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
  const showAdjacent = slideActive || slideAnimating;
  // Neighbors sit `slideDistance` px to the side (see measureSlideDistance),
  // which starts their image right at the screen edge, so they slide in from the
  // edge as the track shifts. Falls back to the full viewport width before the
  // first measurement lands (classic full-width slot), matching the old
  // translateX(±100%) behavior. Their swipe-following crossfade is NOT rendered
  // here: useSlideNavigation writes it straight to the panels' style (via
  // prevPanelRef/nextPanelRef) alongside the track transform, so a touchmove
  // never re-renders this tree. Keep opacity/transition out of the style prop
  // below or React would clobber those writes on unrelated re-renders.
  const adjacentOffset = slideDistance || viewportWidth;

  // Never show the zoom controls while the image is shifted out of view (e.g. a
  // consumer-driven details/overlay pane pushed in via setContentShift): the
  // image isn't on screen, so zooming it makes no sense.
  const showZoomCtrls = zoom && !isTouchDevice && showZoomControls && !contentShift.transform;
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
      style={rootStyle}
    >
      <div
        className={cx("rvl-backdrop", cn("backdrop"))}
        onClick={closeOnBackdropClick ? handleBackdropClick : undefined}
        onTouchEnd={closeOnBackdropClick ? handleBackdropTouchEnd : undefined}
        aria-hidden="true"
      />

      <div ref={topBarRef} className={cx("rvl-bar", "rvl-top-bar", cn("topBar"))}>
        <div className={cx("rvl-header", cn("topBar"))}>{renderHeader?.(ctx)}</div>

        <div className="rvl-header-actions">
          {headerActions}

          {showZoomCtrls && isZoomed && (
            <ChromeButton
              className={cx("rvl-btn-scale", cn("button"))}
              onClick={resetTransform}
              title="Reset zoom"
              ariaLabel="Reset zoom"
            >
              {Math.round(displayScale * 100)}%
            </ChromeButton>
          )}

          {showZoomCtrls && (
            <ChromeButton
              className={cn("button")}
              onClick={ctx.zoomIn}
              title="Zoom in"
              ariaLabel="Zoom in"
            >
              {mergedIcons.zoomIn}
            </ChromeButton>
          )}

          {showZoomCtrls && (
            <ChromeButton
              className={cn("button")}
              onClick={ctx.zoomOut}
              title="Zoom out"
              ariaLabel="Zoom out"
            >
              {mergedIcons.zoomOut}
            </ChromeButton>
          )}

          <ChromeButton
            className={cn("button")}
            onClick={handleClose}
            title="Close (Esc)"
            ariaLabel="Close"
          >
            {mergedIcons.close}
          </ChromeButton>
        </div>
      </div>

      <div
        className="rvl-stage"
        style={{
          transform: contentShift.transform ?? "translateY(0)",
          // animate=false snaps with no transition (overrides the CSS transition)
          transition: contentShift.animate ? undefined : "none",
        }}
      >
        <div
          ref={slideTrackRef}
          // The track fills the whole stage and owns every gesture, so a swipe
          // registers no matter where it starts — including the empty space
          // around a letterboxed image. It's also the backdrop close target
          // (handleTrackTouchEnd / handleTrackClick), distinguishing a tap on the
          // background from a swipe that merely ends there.
          onPointerDown={gestures.handlePointerDown}
          onPointerMove={gestures.handlePointerMove}
          onPointerUp={gestures.handlePointerUp}
          onPointerLeave={gestures.handlePointerUp}
          onTouchStart={gestures.handleTouchStart}
          onTouchMove={gestures.handleTouchMove}
          onTouchEnd={handleTrackTouchEnd}
          onClick={closeOnBackdropClick ? handleTrackClick : undefined}
          className={cx(
            "rvl-track",
            // Promote the track only while a swipe is live (drag + commit/snap
            // animation), then release the layer. Matches `showAdjacent`.
            showAdjacent && "rvl-track-swiping",
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
              ref={prevPanelRef}
              className="rvl-adjacent"
              // Positioned `adjacentOffset` px to the left (see
              // measureSlideDistance): the panel is centered in the full-width
              // track, so this rests its image just past the left screen edge
              // with breathing room. Opacity starts at 0 (CSS) and is driven
              // imperatively by the swipe (see useSlideNavigation).
              style={{ transform: `translateX(${-adjacentOffset}px)` }}
            >
              <img
                src={prevItem.src}
                srcSet={prevItem.srcSet}
                sizes={prevItem.sizes}
                alt=""
                decoding="async"
                className={cx("rvl-img", cn("image"))}
                style={imgStyle}
                draggable={false}
                // Re-measure once this neighbor has real dimensions, so a
                // just-loaded wider image is repositioned to emerge from the
                // screen edge instead of poking into the margin.
                onLoad={refreshSlideDistance}
              />
            </div>
          )}

          <div
            ref={imgWrapperRef}
            className="rvl-img-wrapper"
            // Gestures live on the track (which spans the viewport); the wrapper
            // only stops a tap/click on the image itself from bubbling up to the
            // track's backdrop-close handler.
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleDoubleClickGuarded}
          >
            <img
              ref={imgRef}
              src={item.src}
              srcSet={item.srcSet}
              sizes={item.sizes}
              alt={item.alt ?? ""}
              // `sync`, not `async`, so a navigation src-swap presents the new
              // image atomically with the same-frame DOM changes around it. On a
              // committed swipe the adjacent panel (which showed the sliding
              // image) unmounts and this element takes over at center in one
              // pre-paint frame; `async` lets the browser paint that frame
              // WITHOUT the freshly-swapped image and fill it in a frame later —
              // a blank hand-off frame that reads as a blink at the end of the
              // swipe. The incoming image is always warmed first (neighbor
              // prefetch + the pre-navigate decode in useSlideNavigation), so the
              // sync decode is a cache hit and adds no jank.
              decoding="sync"
              className={cx("rvl-img", cn("image"))}
              style={imgStyle}
              draggable={false}
              onLoad={onImageLoad}
              onError={onImageError}
            />
            {renderImageOverlay?.(ctx)}
          </div>

          {gateEntry && showSpinner && !fullLoaded && (
            <div className={cx("rvl-spinner", cn("spinner"))} role="status" aria-label="Loading">
              <span className="rvl-spinner-ring" aria-hidden="true" />
            </div>
          )}

          {showAdjacent && nextItem && (
            <div
              ref={nextPanelRef}
              className="rvl-adjacent"
              // See prev panel above: positioned `adjacentOffset` px to the
              // right (image just past the right screen edge); opacity is
              // swipe-driven imperatively.
              style={{ transform: `translateX(${adjacentOffset}px)` }}
            >
              <img
                src={nextItem.src}
                srcSet={nextItem.srcSet}
                sizes={nextItem.sizes}
                alt=""
                onLoad={refreshSlideDistance}
                decoding="async"
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
            <div className={cx("rvl-nav-inner", navSlotPlacement === "inline" && "rvl-nav-inline")}>
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
