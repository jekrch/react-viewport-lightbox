import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { clampTranslate as clampTranslatePure, computeZoomTransform, viewportSize } from "./math";
import { prefersReducedMotion } from "./useSharedElementZoom";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Target scale for a desktop double-click zoom (a modest step-in). */
const DOUBLE_CLICK_ZOOM_SCALE = 1.8;
/** Pan momentum: decay time constant (ms) and the speeds (px/ms) it runs between. */
const MOMENTUM_TAU = 325;
const MOMENTUM_MIN = 0.05;
const MOMENTUM_MAX = 4;

/**
 * What a wheel does: `"pan"` (default) zooms on a trackpad pinch or
 * Ctrl+wheel and pans a zoomed image on a plain wheel or two-finger scroll,
 * leaving an unzoomed image's wheel to the browser (so trackpad swipe-back
 * works). `"zoom"` zooms on every wheel event.
 */
export type WheelMode = "pan" | "zoom";

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
  /**
   * Sync `displayScale` to the transform's exact current scale. Call when a
   * per-frame gesture (pinch/pan via `applyTransform`) settles: mid-gesture,
   * React state only updates when the zoomed boundary flips, so the readout
   * can lag the real scale until this runs. Bails out (no re-render) when
   * nothing changed.
   */
  syncDisplayScale: () => void;
  clampTranslate: (x: number, y: number, scale: number) => { x: number; y: number };
  measureBaseDims: () => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  /**
   * Glide a released pan at `vx`/`vy` px/ms, decaying to rest and stopping at
   * the image's edges. Any transform write, wheel, or navigation cancels it.
   * Skipped under reduced motion.
   */
  startMomentum: (vx: number, vy: number) => void;
  /** Stop a glide; returns whether one was running. */
  stopMomentum: () => boolean;
  /** Show the `grabbing` cursor on a zoomed image while a mouse drag pans it. */
  setGrabbing: (grabbing: boolean) => void;
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
  /** See {@link WheelMode}. Default `"pan"`. */
  wheel: WheelMode = "pan",
): ImageZoomPanState {
  const imgRef = useRef<HTMLImageElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const transformRef = useRef<ImageTransform>({ scale: 1, x: 0, y: 0 });
  const baseDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const willChangeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const momentumRef = useRef(0);
  const grabbingRef = useRef(false);

  const stopMomentum = useCallback(() => {
    const running = momentumRef.current !== 0;
    cancelAnimationFrame(momentumRef.current);
    momentumRef.current = 0;
    return running;
  }, []);

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
        // Letterbox fill behind the zoomed image: the theme's opaque backdrop
        // color, falling back to black in a headless shell without styles.css.
        wrapper.style.backgroundColor = "var(--rvl-theme-color, #000)";
        wrapper.style.cursor = grabbingRef.current ? "grabbing" : "grab";
        // Promote only while zoomed/panning; the wrapper is the element the
        // zoom transform lives on, so this is where the hint belongs.
        wrapper.style.willChange = "transform";
        // …and release the hint once transform writes go idle: Chromium keeps
        // a will-changed layer rastered at the scale it was promoted at, so a
        // settled zoom otherwise stays a blurry upscale of the 1x raster.
        // Dropping the hint forces a crisp re-raster at the current scale;
        // the next gesture frame re-promotes. 300ms sits past the longest
        // transition this path plays (0.2s), so the release never lands
        // mid-glide and re-rasters a moving layer.
        clearTimeout(willChangeIdleTimerRef.current);
        willChangeIdleTimerRef.current = setTimeout(() => {
          const w = imgWrapperRef.current;
          if (w && transformRef.current.scale > 1) w.style.willChange = "";
        }, 300);
      }

      // This is the per-frame path for touch pinch/pan, so only re-render
      // React when the zoomed boundary flips (isZoomed / nav-row visibility
      // must track immediately); returning `prev` bails out of the render
      // otherwise. The exact scale is synced by setTransform for discrete ops
      // and by syncDisplayScale when a gesture settles.
      setDisplayScale((prev) => (prev > 1 === t.scale > 1 ? prev : t.scale));
    },
    [imgWrapperRef],
  );

  const setTransform = useCallback(
    (t: ImageTransform, animate: boolean | string = false) => {
      stopMomentum();
      transformRef.current = t;
      applyTransform(t, animate);
      setDisplayScale(t.scale);
    },
    [applyTransform, stopMomentum],
  );

  const syncDisplayScale = useCallback(() => {
    setDisplayScale(transformRef.current.scale);
  }, []);

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
      clampTranslatePure(x, y, scale, baseDimsRef.current, viewportSize()),
    [],
  );

  const startMomentum = useCallback(
    (vx: number, vy: number) => {
      stopMomentum();
      const speed = Math.hypot(vx, vy);
      if (speed < MOMENTUM_MIN || prefersReducedMotion()) return;
      // Cap a wild flick so it can't throw the image edge to edge in a blink.
      const cap = Math.min(1, MOMENTUM_MAX / speed);
      vx *= cap;
      vy *= cap;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(now - last, 32);
        last = now;
        const t = transformRef.current;
        if (t.scale <= 1) return void stopMomentum();
        const wantX = t.x + vx * dt;
        const wantY = t.y + vy * dt;
        const c = clampTranslate(wantX, wantY, t.scale);
        // An axis that hit the image's edge stops there; the other glides on.
        if (c.x !== wantX) vx = 0;
        if (c.y !== wantY) vy = 0;
        const decay = Math.exp(-dt / MOMENTUM_TAU);
        vx *= decay;
        vy *= decay;
        const next = { scale: t.scale, ...c };
        transformRef.current = next;
        applyTransform(next);
        momentumRef.current =
          Math.hypot(vx, vy) < MOMENTUM_MIN / 2 ? 0 : requestAnimationFrame(step);
      };
      momentumRef.current = requestAnimationFrame(step);
    },
    [applyTransform, clampTranslate, stopMomentum],
  );

  const setGrabbing = useCallback(
    (grabbing: boolean) => {
      grabbingRef.current = grabbing;
      const wrapper = imgWrapperRef.current;
      if (wrapper && transformRef.current.scale > 1)
        wrapper.style.cursor = grabbing ? "grabbing" : "grab";
    },
    [imgWrapperRef],
  );

  // Don't let a pending will-change release or a glide outlive the viewer.
  useEffect(() => {
    return () => {
      clearTimeout(willChangeIdleTimerRef.current);
      stopMomentum();
    };
  }, [stopMomentum]);

  // Reset on navigation

  useLayoutEffect(() => {
    stopMomentum();
    const wrapper = imgWrapperRef.current;
    if (wrapper) {
      wrapper.style.transition = "none";
      resetWrapperStyles(wrapper);
    }
    transformRef.current = { scale: 1, x: 0, y: 0 };
  }, [currentIndex, imgWrapperRef, stopMomentum]);

  useEffect(() => {
    setDisplayScale(1);
  }, [currentIndex]);

  // Wheel zoom (desktop)

  useEffect(() => {
    if (!enabled) return;
    const wrapper = imgWrapperRef.current;
    if (!wrapper) return;

    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSync = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => setDisplayScale(transformRef.current.scale), 120);
    };

    // Lines and pages to px, so a mouse and a trackpad move the same distance.
    const px = (d: number, mode: number) => (mode === 1 ? d * 16 : mode === 2 ? d * 100 : d);

    const zoomBy = (factor: number, e: WheelEvent, animate?: string) => {
      ensureBaseDims();
      const t = transformRef.current;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      const clamped = computeZoomTransform({
        prevScale: t.scale,
        nextScale,
        prev: { x: t.x, y: t.y },
        focal: { x: e.clientX, y: e.clientY },
        viewport: viewportSize(),
        baseDims: baseDimsRef.current,
        zoomToCursor,
      });
      const next = { scale: nextScale, ...clamped };
      if (animate) {
        setTransform(next, animate);
        return;
      }
      // A trackpad pinch or pan streams events every frame: write the style
      // directly and sync the readout once the stream goes quiet.
      transformRef.current = next;
      applyTransform(next);
      scheduleSync();
    };

    const handleWheel = (e: WheelEvent) => {
      stopMomentum();
      const dy = px(e.deltaY, e.deltaMode);

      if (wheel === "zoom") {
        // Every wheel event zooms (the pre-1.0 behavior).
        e.preventDefault();
        const step = -(Math.max(-100, Math.min(100, dy)) / 100) * 0.05;
        // A short transition lets each discrete wheel tick glide into the
        // next instead of snapping; rapid ticks restart it.
        zoomBy(1 + step, e, "transform 0.1s ease-out");
        return;
      }

      // `ctrlKey` is set on a trackpad pinch (browsers report it as a
      // Ctrl+wheel) and on a real Ctrl+wheel: both zoom. Clamped so one mouse
      // notch is a step, not a jump; a pinch's small deltas track the fingers.
      if (e.ctrlKey) {
        e.preventDefault();
        zoomBy(Math.exp(-Math.max(-25, Math.min(25, dy)) * 0.01), e);
        return;
      }

      // A plain wheel or two-finger scroll pans a zoomed image. Unzoomed, it
      // is left alone, so the browser's trackpad swipe-back still works.
      const t = transformRef.current;
      if (t.scale <= 1) return;
      e.preventDefault();
      // Shift turns a mouse wheel's vertical delta into a horizontal pan.
      let dx = px(e.deltaX, e.deltaMode);
      let vy = dy;
      if (e.shiftKey && dx === 0) [dx, vy] = [vy, 0];
      const next = { scale: t.scale, ...clampTranslate(t.x - dx, t.y - vy, t.scale) };
      transformRef.current = next;
      applyTransform(next);
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener("wheel", handleWheel);
      clearTimeout(syncTimer);
    };
  }, [
    imgWrapperRef,
    setTransform,
    applyTransform,
    clampTranslate,
    enabled,
    zoomToCursor,
    ensureBaseDims,
    stopMomentum,
    wheel,
  ]);

  // Double-click toggle

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      e.stopPropagation();

      ensureBaseDims();

      if (transformRef.current.scale > 1) {
        resetTransform();
      } else {
        // Anchor the zoom on the click point (same rule as wheel/pinch) so the
        // detail the user aimed at stays put instead of sliding off toward the
        // center; `zoomToCursor: false` keeps the old center-zoom.
        const clamped = computeZoomTransform({
          prevScale: 1,
          nextScale: DOUBLE_CLICK_ZOOM_SCALE,
          prev: { x: 0, y: 0 },
          focal: { x: e.clientX, y: e.clientY },
          viewport: viewportSize(),
          baseDims: baseDimsRef.current,
          zoomToCursor,
        });
        setTransform({ scale: DOUBLE_CLICK_ZOOM_SCALE, ...clamped }, true);
      }
    },
    [resetTransform, setTransform, enabled, ensureBaseDims, zoomToCursor],
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
    syncDisplayScale,
    clampTranslate,
    measureBaseDims,
    handleDoubleClick,
    startMomentum,
    stopMomentum,
    setGrabbing,
  };
}

export { MIN_SCALE, MAX_SCALE };
