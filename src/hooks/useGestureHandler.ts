import { useCallback, useRef } from "react";
import { computeZoomTransform, releaseVelocity, viewportSize, type PointerSample } from "./math";
import { MIN_SCALE, MAX_SCALE, type ImageZoomPanState } from "./useImageZoomPan";
import type { SlideNavigationState } from "./useSlideNavigation";
import type { SwipeDismissHandlers } from "./useSwipeDismiss";

/** Target scale for a touch double-tap zoom (a larger step-in than desktop). */
const DOUBLE_TAP_ZOOM_SCALE = 2.5;

interface GestureHandlers {
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  /**
   * True when the most recent gesture involved real movement (a locked/rejected
   * swipe, a pan, or a pinch) rather than a stationary tap. Consumers use this
   * to tell a background swipe apart from a background tap so a swipe that ends
   * over empty space doesn't get mistaken for a tap-to-close.
   */
  gestureMovedRef: React.MutableRefObject<boolean>;
}

interface PanGesture {
  isDragging: boolean;
  pointerStart: { x: number; y: number };
  translateStart: { x: number; y: number };
  pinchStartDist: number | null;
  pinchStartScale: number;
  pinchMidpoint: { x: number; y: number } | null;
  lastTouchPos: { x: number; y: number } | null;
  /** Recent pan positions, for the release velocity that momentum glides on. */
  samples: PointerSample[];
}

interface SlideGesture {
  active: boolean;
  startX: number;
  startY: number;
  startTime: number;
  locked: boolean;
  rejected: boolean;
  /** Locked vertical and handed to the swipe-to-close handlers. */
  dismissing: boolean;
}

/**
 * Coordinates zoom/pan and slide gestures, routing pointer and touch events
 * to the appropriate behavior based on current zoom state.
 *
 * When zoomed (scale > 1): pointer/touch drags are pans.
 * When unzoomed (scale === 1): horizontal drags are slide-to-navigate, and
 * vertical drags go to `dismiss` (swipe-to-close) when given, else do nothing.
 * Two-finger touch is always a pinch-zoom.
 */
export function useGestureHandler(
  zoomPan: ImageZoomPanState,
  slide: SlideNavigationState,
  hasPrev: boolean,
  hasNext: boolean,
  /** When false, pinch-zoom and double-tap-zoom are disabled. Default true. */
  zoomEnabled = true,
  /**
   * When true (default), pinch-zoom anchors on the gesture midpoint. When
   * false, it zooms about the viewport center.
   */
  zoomToCursor = true,
  /**
   * Swipe-to-close handlers (see `useSwipeDismiss`). Omitted, a vertical drag
   * is rejected and does nothing.
   */
  dismiss?: SwipeDismissHandlers,
): GestureHandlers {
  const {
    transformRef,
    baseDimsRef,
    clampTranslate,
    setTransform,
    applyTransform,
    syncDisplayScale,
    resetTransform,
    measureBaseDims,
    startMomentum,
    stopMomentum,
    setGrabbing,
  } = zoomPan;
  const {
    applySlideOffset,
    resolveSlide,
    snapBack,
    setSlideActive,
    swipeOffsetRef,
    refreshSlideDistance,
  } = slide;

  const panRef = useRef<PanGesture>({
    isDragging: false,
    pointerStart: { x: 0, y: 0 },
    translateStart: { x: 0, y: 0 },
    pinchStartDist: null,
    pinchStartScale: 1,
    pinchMidpoint: null,
    lastTouchPos: null,
    samples: [],
  });

  // Pan samples: keep a short tail, enough for releaseVelocity's 100 ms window.
  const samplePan = useCallback((x: number, y: number) => {
    const samples = panRef.current.samples;
    samples.push({ t: performance.now(), x, y });
    if (samples.length > 8) samples.shift();
  }, []);
  // A released pan coasts on at the speed it let go with.
  const releasePan = useCallback(() => {
    const p = panRef.current;
    const v = releaseVelocity(p.samples, performance.now());
    p.samples = [];
    if (transformRef.current.scale > 1) startMomentum(v.x, v.y);
  }, [transformRef, startMomentum]);

  const slideRef = useRef<SlideGesture>({
    active: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    locked: false,
    rejected: false,
    dismissing: false,
  });

  // Double-tap detection for touch
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });

  // True once the current gesture moves past the tap threshold (swipe/pan/pinch).
  // Reset at the start of every fresh single-pointer gesture.
  const gestureMovedRef = useRef(false);

  // Shared slide start helper

  const beginSlide = useCallback(
    (x: number, y: number) => {
      setSlideActive(true);
      // Prime the slide distance from the current image so the neighbor panels
      // start at roughly the right offset; the hook re-measures (now including
      // the just-rendered neighbors) before the first frame paints.
      refreshSlideDistance();
      const sg = slideRef.current;
      sg.active = true;
      sg.startX = x;
      sg.startY = y;
      sg.startTime = Date.now();
      sg.locked = false;
      sg.rejected = false;
      sg.dismissing = false;
    },
    [setSlideActive, refreshSlideDistance],
  );

  const updateSlide = useCallback(
    (clientX: number, clientY: number, lockThreshold: number, angleBias: number) => {
      const sg = slideRef.current;
      if (!sg.active || sg.rejected) return;

      const dx = clientX - sg.startX;
      const dy = clientY - sg.startY;

      if (sg.dismissing) {
        dismiss?.move(dx, dy);
        return;
      }

      if (!sg.locked) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < lockThreshold && absDy < lockThreshold) return;
        // Moved past the tap threshold in either axis — no longer a tap, even if
        // the drag is rejected as vertical below.
        gestureMovedRef.current = true;
        if (absDy > absDx * angleBias) {
          // Vertical: swipe-to-close, unless a slide is still settling (the
          // track is mid-flight) or the dismiss declines.
          if (dismiss && swipeOffsetRef.current === 0 && dismiss.begin()) {
            sg.dismissing = true;
            // The neighbor panels were mounted for a possible horizontal
            // slide; this drag won't use them.
            setSlideActive(false);
            dismiss.move(dx, dy);
            return;
          }
          sg.rejected = true;
          return;
        }
        sg.locked = true;
      }

      let offset = dx;
      if ((offset > 0 && !hasPrev) || (offset < 0 && !hasNext)) {
        offset *= 0.2; // rubber-band resistance at edges
      }
      applySlideOffset(offset);
    },
    [hasPrev, hasNext, applySlideOffset, dismiss, swipeOffsetRef, setSlideActive],
  );

  const endSlide = useCallback(
    (allowResolve: boolean) => {
      const sg = slideRef.current;
      if (sg.active && sg.dismissing) {
        sg.active = false;
        sg.dismissing = false;
        dismiss?.release();
        return;
      }
      if (sg.active && sg.locked && !sg.rejected && allowResolve) {
        const startTime = sg.startTime;
        sg.active = false;
        resolveSlide(startTime);
      } else {
        sg.active = false;
        if (swipeOffsetRef.current === 0) setSlideActive(false);
      }
    },
    [resolveSlide, setSlideActive, swipeOffsetRef, dismiss],
  );

  // Pointer (mouse) handlers

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;

      // A press that catches a glide stops it; it isn't a click.
      gestureMovedRef.current = stopMomentum();
      if (transformRef.current.scale > 1) {
        e.preventDefault();
        const p = panRef.current;
        p.isDragging = true;
        p.pointerStart = { x: e.clientX, y: e.clientY };
        p.translateStart = { x: transformRef.current.x, y: transformRef.current.y };
        p.samples = [];
        samplePan(e.clientX, e.clientY);
        setGrabbing(true);
      } else {
        beginSlide(e.clientX, e.clientY);
      }
    },
    [transformRef, beginSlide, stopMomentum, setGrabbing, samplePan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;

      const p = panRef.current;
      if (p.isDragging && transformRef.current.scale > 1) {
        const dx = e.clientX - p.pointerStart.x;
        const dy = e.clientY - p.pointerStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) gestureMovedRef.current = true;
        const t = transformRef.current;
        const clamped = clampTranslate(p.translateStart.x + dx, p.translateStart.y + dy, t.scale);
        setTransform({ scale: t.scale, ...clamped });
        samplePan(e.clientX, e.clientY);
        return;
      }

      // Mouse slide: lockThreshold=4, angleBias=1 (45° cutoff)
      updateSlide(e.clientX, e.clientY, 4, 1);
    },
    [transformRef, clampTranslate, setTransform, updateSlide, samplePan],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = panRef.current;
      if (p.isDragging) {
        p.isDragging = false;
        setGrabbing(false);
        releasePan();
      }
      endSlide(true);
    },
    [endSlide, setGrabbing, releasePan],
  );

  // Touch handlers

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const p = panRef.current;
      // A touch that catches a glide stops it; it isn't a tap.
      const caught = stopMomentum();
      p.samples = [];

      if (e.touches.length === 2 && zoomEnabled) {
        // Pinch start
        gestureMovedRef.current = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        p.pinchStartDist = Math.hypot(dx, dy);
        p.pinchStartScale = transformRef.current.scale;
        p.pinchMidpoint = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
        p.lastTouchPos = null;

        // Cancel any slide (or dismiss drag) in progress
        const sg = slideRef.current;
        if (sg.dismissing) {
          sg.active = false;
          sg.dismissing = false;
          dismiss?.cancel();
        } else if (sg.active) {
          sg.active = false;
          snapBack();
        }
      } else if (e.touches.length === 1) {
        gestureMovedRef.current = caught;
        if (transformRef.current.scale > 1) {
          p.lastTouchPos = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
          p.pointerStart = p.lastTouchPos;
        } else {
          beginSlide(e.touches[0].clientX, e.touches[0].clientY);
        }
      }
    },
    [transformRef, snapBack, beginSlide, zoomEnabled, dismiss, stopMomentum],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const p = panRef.current;

      if (e.touches.length === 2 && p.pinchStartDist !== null) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / p.pinchStartDist;
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.pinchStartScale * ratio));
        const t = transformRef.current;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        // Also translate by however far the midpoint itself moved since the last
        // frame, so sliding both fingers across the screen repositions the image
        // (standard pinch-to-pan behavior).
        const prevMid = p.pinchMidpoint;
        const focalPan = {
          x: prevMid ? midX - prevMid.x : 0,
          y: prevMid ? midY - prevMid.y : 0,
        };
        p.pinchMidpoint = { x: midX, y: midY };
        const clamped = computeZoomTransform({
          prevScale: t.scale,
          nextScale,
          prev: { x: t.x, y: t.y },
          focal: { x: midX, y: midY },
          viewport: viewportSize(),
          baseDims: baseDimsRef.current,
          zoomToCursor,
          focalPan,
        });

        const next = { scale: nextScale, ...clamped };
        transformRef.current = next;
        // applyTransform writes the wrapper style directly; it only re-renders
        // React when the zoomed boundary flips, so a pinch frame costs no
        // render. The exact scale reaches state via syncDisplayScale on
        // touchend (the zoom %/controls are hidden on touch-primary devices,
        // so nothing visible lags mid-gesture).
        applyTransform(next);
      } else if (e.touches.length === 1 && p.lastTouchPos && transformRef.current.scale > 1) {
        // Zoomed pan
        const touch = e.touches[0];
        const dx = touch.clientX - p.lastTouchPos.x;
        const dy = touch.clientY - p.lastTouchPos.y;
        // Measured from where the pan began: a slow pan's per-frame steps are
        // all small, but it still isn't a tap.
        if (
          Math.abs(touch.clientX - p.pointerStart.x) > 4 ||
          Math.abs(touch.clientY - p.pointerStart.y) > 4
        )
          gestureMovedRef.current = true;
        p.lastTouchPos = { x: touch.clientX, y: touch.clientY };
        samplePan(touch.clientX, touch.clientY);

        const t = transformRef.current;
        const clamped = clampTranslate(t.x + dx, t.y + dy, t.scale);
        const next = { scale: t.scale, ...clamped };
        transformRef.current = next;
        applyTransform(next);
      } else if (e.touches.length === 1) {
        // Touch slide: lockThreshold=6, angleBias=0.8
        const touch = e.touches[0];
        updateSlide(touch.clientX, touch.clientY, 6, 0.8);
      }
    },
    [
      transformRef,
      baseDimsRef,
      clampTranslate,
      applyTransform,
      updateSlide,
      zoomToCursor,
      samplePan,
    ],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const p = panRef.current;

      // A dismiss drag settles on its own terms (close, or glide back); the
      // zoom reset and tap detection below must not touch the wrapper it moved.
      const dg = slideRef.current;
      if (dg.dismissing) {
        if (e.touches.length === 0) {
          dg.active = false;
          dg.dismissing = false;
          dismiss?.release();
        }
        return;
      }

      const wasPinch = p.pinchStartDist !== null;
      p.pinchStartDist = null;
      p.pinchMidpoint = null;

      // Per-frame pinch/pan writes bypass React (see handleTouchMove); now
      // that the gesture is settling, sync the exact scale to state so the
      // zoom readout/controls are correct. No-op re-render-wise if unchanged.
      syncDisplayScale();

      if (e.touches.length === 0 && transformRef.current.scale <= 1) {
        // Resolve slide if active
        const sg = slideRef.current;
        if (sg.active && sg.locked && !sg.rejected) {
          const startTime = sg.startTime;
          sg.active = false;
          resolveSlide(startTime);
          transformRef.current = { scale: 1, x: 0, y: 0 };
          return;
        }
        sg.active = false;
        resetTransform();
      }

      // A one-finger pan let go: coast.
      if (e.touches.length === 0 && !wasPinch && p.lastTouchPos) releasePan();

      // One finger remaining after pinch → start pan from that finger
      if (e.touches.length === 1 && transformRef.current.scale > 1) {
        p.samples = [];
        p.lastTouchPos = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        p.pointerStart = p.lastTouchPos;
      } else {
        p.lastTouchPos = null;
      }

      // Double-tap detection (single finger, not after pinch, not after slide)
      const sg = slideRef.current;
      if (
        zoomEnabled &&
        e.touches.length === 0 &&
        e.changedTouches.length === 1 &&
        !wasPinch &&
        !sg.locked &&
        // A pan's release (or a touch that stopped a glide) isn't a tap, so it
        // can't be the first half of a double tap either.
        !gestureMovedRef.current
      ) {
        const touch = e.changedTouches[0];
        const now = Date.now();
        const last = lastTapRef.current;
        const timeDelta = now - last.time;
        const distDelta = Math.hypot(touch.clientX - last.x, touch.clientY - last.y);

        if (timeDelta < 300 && distDelta < 30) {
          lastTapRef.current = { time: 0, x: 0, y: 0 };
          if (transformRef.current.scale > 1) {
            resetTransform();
          } else {
            // Anchor the zoom on the tap point (same rule as pinch/wheel) so
            // the detail the user tapped stays put instead of sliding off
            // toward the center; `zoomToCursor: false` keeps center-zoom.
            // Base dims can be unmeasured if the double-tap beats the image's
            // load handler; measure lazily like the wheel path does.
            if (baseDimsRef.current.width === 0) measureBaseDims();
            const clamped = computeZoomTransform({
              prevScale: 1,
              nextScale: DOUBLE_TAP_ZOOM_SCALE,
              prev: { x: 0, y: 0 },
              focal: { x: touch.clientX, y: touch.clientY },
              viewport: viewportSize(),
              baseDims: baseDimsRef.current,
              zoomToCursor,
            });
            setTransform({ scale: DOUBLE_TAP_ZOOM_SCALE, ...clamped }, true);
          }
        } else {
          lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
        }
      }

      // Cleanup slide if released without committing
      if (e.touches.length === 0 && sg.active && !sg.locked) {
        sg.active = false;
        if (swipeOffsetRef.current === 0) setSlideActive(false);
      }
    },
    [
      transformRef,
      baseDimsRef,
      measureBaseDims,
      resetTransform,
      setTransform,
      syncDisplayScale,
      resolveSlide,
      setSlideActive,
      swipeOffsetRef,
      zoomEnabled,
      zoomToCursor,
      dismiss,
      releasePan,
    ],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    gestureMovedRef,
  };
}
