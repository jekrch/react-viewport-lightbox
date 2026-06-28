import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageViewerProps, ViewerContext } from "../types";
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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Batteries-included fullscreen image viewer: zoom, pan, pinch, and swipe
 * navigation with themeable chrome and render slots. Controlled via `index` /
 * `onIndexChange`; mount it when open and it runs its own enter/exit animation,
 * calling `onClose` after the exit completes.
 */
export function ImageViewer({
  items,
  index,
  onIndexChange,
  onNavigate,
  onClose,
  zoom = true,
  showCounter = true,
  loop = false,
  renderHeader,
  renderHeaderActions,
  renderNavStart,
  renderNavEnd,
  renderFooter,
  renderOverlay,
  classNames,
  icons,
  ariaLabel,
}: ImageViewerProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
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

  const zoomPan = useImageZoomPan(imgWrapperRef, index, zoom);
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

  const slide = useSlideNavigation(items, index, onIndexChange, onNavigate);
  const { slideTrackRef, slideActive, slideAnimating, swipeOffset, commitSlide } = slide;

  const gestures = useGestureHandler(zoomPan, slide, hasPrevLinear, hasNextLinear, zoom);

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

  const handleClose = useCallback(() => {
    setClosing(true);
    setVisible(false);
    const delay = prefersReducedMotion() ? 0 : ANIM_MS;
    setTimeout(onClose, delay);
  }, [onClose]);

  const navigate = useCallback(
    (dir: "prev" | "next") => {
      if (dir === "prev") {
        if (hasPrevLinear) commitSlide("prev");
        else if (loop) {
          // Wrap jumps without a slide animation, so commitSlide's onSlideStart
          // never fires — emit it here so overlays still react.
          onNavigate?.("prev");
          onIndexChange(items.length - 1);
        }
      } else {
        if (hasNextLinear) commitSlide("next");
        else if (loop) {
          onNavigate?.("next");
          onIndexChange(0);
        }
      }
    },
    [hasPrevLinear, hasNextLinear, loop, commitSlide, onIndexChange, onNavigate, items.length],
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

  const ctx: ViewerContext = {
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

  const totalDigits = String(items.length).length;
  const counterMinWidth = `${totalDigits * 2 * 0.6 + 1.5}em`;

  const prevItem = hasPrevLinear ? items[index - 1] : null;
  const nextItem = hasNextLinear ? items[index + 1] : null;
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
        onClick={handleClose}
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
        style={{
          transform: contentShift.transform ?? "translateY(0)",
          // animate=false snaps with no transition (overrides the CSS transition)
          transition: contentShift.animate ? undefined : "none",
        }}
      >
        <div
          ref={slideTrackRef}
          className={cx("rvl-track", visible && !closing && "rvl-track-visible")}
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
              onLoad={measureBaseDims}
            />
          </div>

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
              {navEnd != null && (
                <div className={cx("rvl-nav-end", cn("navEnd"))}>{navEnd}</div>
              )}
            </div>
          </div>
        )}

        {renderFooter && <div className="rvl-footer">{renderFooter(ctx)}</div>}
      </div>

      {renderOverlay && <div className={cx("rvl-overlay", cn("overlay"))}>{renderOverlay(ctx)}</div>}
    </div>
  );
}
