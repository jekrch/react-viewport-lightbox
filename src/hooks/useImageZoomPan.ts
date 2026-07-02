import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { clampTranslate as clampTranslatePure, computeZoomTransform } from "./math";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Target scale for a desktop double-click zoom (a modest step-in). */
const DOUBLE_CLICK_ZOOM_SCALE = 1.8;

export interface ImageTransform {
  scale: number;
  x: number;
  y: number;
}

/**
 * Clears the inline styles the zoom applies to the wrapper, returning it to its
 * resting (unzoomed) state. Leaves `transition` alone so callers can control
 * whether the reset animates.
 */
function resetWrapperStyles(wrapper: HTMLDivElement) {
  wrapper.style.transform = "none";
  wrapper.style.position = "";
  wrapper.style.inset = "";
  wrapper.style.zIndex = "";
  wrapper.style.backgroundColor = "";
  wrapper.style.cursor = "";
  // Release the compositing layer once the zoom settles back to 1.
  wrapper.style.willChange = "";
}

export interface ImageZoomPanState {
  imgRef: RefObject<HTMLImageElement | null>;
  displayScale: number;
  isZoomed: boolean;
  transformRef: React.MutableRefObject<ImageTransform>;

  /** Base (unscaled) image dimensions for clamp calculations */
  baseDimsRef: React.MutableRefObject<{ width: number; height: number }>;

  resetTransform: () => void;
  /**
   * `animate` may be a boolean (true = default 0.2s ease-out) or an explicit
   * CSS transition string (e.g. a shorter one for smooth wheel-zoom stepping).
   */
  setTransform: (t: ImageTransform, animate?: boolean | string) => void;
  applyTransform: (t: ImageTransform, animate?: boolean | string) => void;
  clampTranslate: (x: number, y: number, scale: number) => { x: number; y: number };
  measureBaseDims: () => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
}

/**
 * Manages zoom/pan state for an image viewer.
 *
 * Applies scale + translate transforms to the **wrapper** element rather
 * than the image itself. This avoids an iOS Safari compositing bug where
 * CSS scale() on an element clips its painted output to the element's
 * original layout bounds.
 *
 * When zoomed, the wrapper is positioned absolute inset-0 (full viewport),
 * so its layout bounds already match the viewport and scaling it won't clip.
 * The image stays at its natural constrained size, centered via flexbox.
 */
export function useImageZoomPan(
  imgWrapperRef: RefObject<HTMLDivElement | null>,
  currentIndex: number,
  /** When false, wheel-zoom and double-click-zoom are disabled. Default true. */
  enabled = true,
  /**
   * When true (default), wheel-zoom anchors on the cursor. When false, it zooms
   * about the viewport center.
   */
  zoomToCursor = true,
): ImageZoomPanState {
  const imgRef = useRef<HTMLImageElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const transformRef = useRef<ImageTransform>({ scale: 1, x: 0, y: 0 });
  const baseDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Core helpers

  const applyTransform = useCallback(
    (t: ImageTransform, animate: boolean | string = false) => {
      const wrapper = imgWrapperRef.current;
      if (!wrapper) return;
      wrapper.style.transition =
        typeof animate === "string" ? animate : animate ? "transform 0.2s ease-out" : "none";

      if (t.scale <= 1) {
        resetWrapperStyles(wrapper);
      } else {
        wrapper.style.transform = `scale(${t.scale}) translate(${t.x / t.scale}px, ${t.y / t.scale}px)`;
        wrapper.style.position = "absolute";
        wrapper.style.inset = "0";
        wrapper.style.zIndex = "30";
        wrapper.style.backgroundColor = "black";
        wrapper.style.cursor = "grab";
        // Promote only while zoomed/panning; the wrapper is the element the
        // zoom transform lives on, so this is where the hint belongs.
        wrapper.style.willChange = "transform";
      }

      // Keep React state in sync so isZoomed reflects reality
      setDisplayScale(t.scale);
    },
    [imgWrapperRef],
  );

  const setTransform = useCallback(
    (t: ImageTransform, animate: boolean | string = false) => {
      transformRef.current = t;
      applyTransform(t, animate);
      setDisplayScale(t.scale);
    },
    [applyTransform],
  );

  const resetTransform = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 }, true);
  }, [setTransform]);

  const measureBaseDims = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    baseDimsRef.current = { width: img.offsetWidth, height: img.offsetHeight };
  }, []);

  // Lazily populate base dims the first time a zoom gesture needs them (wheel /
  // double-click can fire before the load effect has measured).
  const ensureBaseDims = useCallback(() => {
    if (baseDimsRef.current.width === 0) measureBaseDims();
  }, [measureBaseDims]);

  /**
   * Clamp so the image edge can't pan past the viewport edge.
   */
  const clampTranslate = useCallback(
    (x: number, y: number, scale: number): { x: number; y: number } =>
      clampTranslatePure(x, y, scale, baseDimsRef.current, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    [],
  );

  // Reset on navigation

  useLayoutEffect(() => {
    const wrapper = imgWrapperRef.current;
    if (wrapper) {
      wrapper.style.transition = "none";
      resetWrapperStyles(wrapper);
    }
    transformRef.current = { scale: 1, x: 0, y: 0 };
  }, [currentIndex, imgWrapperRef]);

  useEffect(() => {
    setDisplayScale(1);
  }, [currentIndex]);

  // Wheel zoom (desktop)

  useEffect(() => {
    if (!enabled) return;
    const wrapper = imgWrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      ensureBaseDims();

      const t = transformRef.current;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= 100;

      const normalized = Math.max(-100, Math.min(100, dy));
      const step = -(normalized / 100) * 0.05;
      const factor = 1 + step;

      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      const clamped = computeZoomTransform({
        prevScale: t.scale,
        nextScale,
        prev: { x: t.x, y: t.y },
        focal: { x: e.clientX, y: e.clientY },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        baseDims: baseDimsRef.current,
        zoomToCursor,
      });
      // A short transition lets each discrete wheel tick glide into the next
      // instead of snapping, which smooths out the stepped look of scroll-zoom.
      // Rapid ticks restart the transition, producing continuous motion.
      setTransform({ scale: nextScale, ...clamped }, "transform 0.1s ease-out");
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, [imgWrapperRef, setTransform, enabled, zoomToCursor, ensureBaseDims]);

  // Double-click toggle

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      e.stopPropagation();

      ensureBaseDims();

      if (transformRef.current.scale > 1) {
        resetTransform();
      } else {
        setTransform({ scale: DOUBLE_CLICK_ZOOM_SCALE, x: 0, y: 0 }, true);
      }
    },
    [resetTransform, setTransform, enabled, ensureBaseDims],
  );

  return {
    imgRef,
    displayScale,
    isZoomed: displayScale > 1,
    transformRef,
    baseDimsRef,
    resetTransform,
    setTransform,
    applyTransform,
    clampTranslate,
    measureBaseDims,
    handleDoubleClick,
  };
}

export { MIN_SCALE, MAX_SCALE };
