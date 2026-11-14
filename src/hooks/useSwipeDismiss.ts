import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { prefersReducedMotion, ANIM_MS } from "./useSharedElementZoom";

/** Snap-back glide when a dismiss drag is released short of the threshold. */
const SNAP_MS = 250;
const SNAP_EASE = "cubic-bezier(0.2, 0, 0, 1)";
/** How far the image shrinks at full drag progress (0.3 → 70% size). */
const MAX_SHRINK = 0.3;
/** Drag distance, as a share of the viewport height, that counts as full progress. */
const PROGRESS_SPAN = 0.5;
/** Released this far (px, capped by a share of the viewport) and it closes. */
const DISTANCE_PX = 120;
const DISTANCE_VH = 0.2;
/** …or flicked at least this fast (px/ms) toward the drag, past a small minimum. */
const FLICK_VELOCITY = 0.5;
const FLICK_MIN_PX = 30;
/** Window of pointer samples the release velocity is measured over. */
const VELOCITY_WINDOW_MS = 100;

/**
 * The imperative half of swipe-to-close that a gesture router drives. All four
 * are identity-stable; none of them re-render.
 */
export interface SwipeDismissHandlers {
  /**
   * A drag has locked vertical. Returns false when a dismiss isn't available
   * right now (disabled, or the viewer is closing); the caller should then
   * treat the drag as rejected, as before.
   */
  begin: () => boolean;
  /** Follow the finger: `dx`/`dy` are the offsets from where the drag started. */
  move: (dx: number, dy: number) => void;
  /** The drag ended: close if it went far or fast enough, else glide back. */
  release: () => void;
  /** Abandon the drag (e.g. a second finger turned it into a pinch): glide back. */
  cancel: () => void;
}

export interface SwipeDismissState extends SwipeDismissHandlers {
  /**
   * After a dismiss committed, carry the image on off-screen in the direction
   * it was thrown. For closes that have no thumbnail to collapse into (no
   * `getOrigin`, the thumbnail scrolled away, reduced motion), so the image
   * leaves the way it was going instead of fading out where it was let go.
   * No-op when no dismiss is in flight.
   */
  flyOut: () => void;
}

export interface SwipeDismissArgs {
  /** False suspends it: `begin` declines, so vertical drags do nothing. */
  enabled: boolean;
  /** The element that follows the finger (the image wrapper, so slotted image overlays move with it). */
  wrapperRef: RefObject<HTMLElement | null>;
  /** Elements whose opacity tracks the drag (backdrop, bars), fading as the image is pulled away. */
  backdropRef: RefObject<HTMLElement | null>;
  chromeRefs: RefObject<HTMLElement | null>[];
  /** Run the close. Called once, when a release commits. */
  onDismiss: () => void;
}

/**
 * Swipe-down (or up) to close: the image follows the drag and shrinks while the
 * backdrop and chrome fade, revealing the page behind; release past a distance
 * or with a flick and the viewer closes, otherwise everything glides back.
 *
 * Every frame is a direct style write on the wrapper, backdrop and bars — no
 * React state — like the horizontal swipe. On commit the wrapper KEEPS its drag
 * transform: the close's collapse-into-thumbnail plays from that pose (see
 * `useSharedElementZoom.playCollapse`, which maps its targets through it), and
 * the backdrop/bars hand their inline opacity back to the stylesheet so the
 * close fade carries on from wherever the drag left them.
 */
export function useSwipeDismiss({
  enabled,
  wrapperRef,
  backdropRef,
  chromeRefs,
  onDismiss,
}: SwipeDismissArgs): SwipeDismissState {
  const enabledRef = useRef(enabled);
  const onDismissRef = useRef(onDismiss);
  const chromeRefsRef = useRef(chromeRefs);
  useEffect(() => {
    enabledRef.current = enabled;
    onDismissRef.current = onDismiss;
    chromeRefsRef.current = chromeRefs;
  });

  const activeRef = useRef(false);
  const committedRef = useRef(false);
  const poseRef = useRef({ dx: 0, dy: 0, scale: 1 });
  const samplesRef = useRef<{ t: number; y: number }[]>([]);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(settleTimerRef.current), []);

  const fadeEls = useCallback((): HTMLElement[] => {
    const els: HTMLElement[] = [];
    if (backdropRef.current) els.push(backdropRef.current);
    for (const r of chromeRefsRef.current) if (r.current) els.push(r.current);
    return els;
  }, [backdropRef]);

  const begin = useCallback(() => {
    if (!enabledRef.current || committedRef.current) return false;
    clearTimeout(settleTimerRef.current);
    activeRef.current = true;
    samplesRef.current = [];
    const wrapper = wrapperRef.current;
    if (wrapper) wrapper.style.willChange = "transform";
    return true;
  }, [wrapperRef]);

  const move = useCallback(
    (dx: number, dy: number) => {
      if (!activeRef.current) return;
      const now = performance.now();
      const samples = samplesRef.current;
      samples.push({ t: now, y: dy });
      while (samples.length > 2 && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();

      const vh = window.innerHeight || 1;
      const progress = Math.min(1, Math.abs(dy) / (vh * PROGRESS_SPAN));
      const scale = 1 - MAX_SHRINK * progress;
      poseRef.current = { dx, dy, scale };

      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.style.transition = "none";
        wrapper.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
      }
      const backdrop = backdropRef.current;
      if (backdrop) {
        backdrop.style.transition = "none";
        backdrop.style.opacity = String(1 - progress);
      }
      // The bars go first: they're gone by a third of the way.
      for (const r of chromeRefsRef.current) {
        const el = r.current;
        if (!el) continue;
        el.style.transition = "none";
        el.style.opacity = String(Math.max(0, 1 - progress * 3));
      }
    },
    [wrapperRef, backdropRef],
  );

  const snapBack = useCallback(() => {
    activeRef.current = false;
    poseRef.current = { dx: 0, dy: 0, scale: 1 };
    const reduce = prefersReducedMotion();
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.style.transition = reduce ? "none" : `transform ${SNAP_MS}ms ${SNAP_EASE}`;
      wrapper.style.transform = "none";
    }
    const els = fadeEls();
    for (const el of els) {
      el.style.transition = reduce ? "none" : `opacity ${SNAP_MS}ms ease-out`;
      // Back to the stylesheet's value (fully shown while open).
      el.style.opacity = "";
    }
    // Once settled, hand the transitions back to the stylesheet too (the bars'
    // own CSS transition covers more than opacity). Skipped if a new drag began.
    settleTimerRef.current = setTimeout(
      () => {
        if (activeRef.current || committedRef.current) return;
        for (const el of els) el.style.transition = "";
        const w = wrapperRef.current;
        if (w && w.style.transform === "none") w.style.willChange = "";
      },
      reduce ? 0 : SNAP_MS + 50,
    );
  }, [wrapperRef, fadeEls]);

  const release = useCallback(() => {
    if (!activeRef.current) return;
    const { dy } = poseRef.current;
    const samples = samplesRef.current;
    let velocity = 0;
    if (samples.length >= 2) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      velocity = (b.y - a.y) / Math.max(b.t - a.t, 1);
    }
    const vh = window.innerHeight || 1;
    const far = Math.abs(dy) >= Math.min(DISTANCE_PX, vh * DISTANCE_VH);
    // A flick counts only toward the way the image was pulled: flicking it back
    // toward center is the user changing their mind.
    const flicked =
      Math.abs(dy) >= FLICK_MIN_PX &&
      Math.abs(velocity) >= FLICK_VELOCITY &&
      Math.sign(velocity) === Math.sign(dy);
    if (!far && !flicked) {
      snapBack();
      return;
    }

    activeRef.current = false;
    committedRef.current = true;
    // Hand the fades back to the stylesheet: once the close drops
    // `.rvl-visible`, the CSS fade runs from the current inline value on down.
    for (const el of fadeEls()) {
      el.style.transition = "";
      el.style.opacity = "";
    }
    onDismissRef.current();
  }, [snapBack, fadeEls]);

  const cancel = useCallback(() => {
    if (activeRef.current) snapBack();
  }, [snapBack]);

  const flyOut = useCallback(() => {
    if (!committedRef.current) return;
    const wrapper = wrapperRef.current;
    if (!wrapper || prefersReducedMotion()) return;
    const { dx, dy, scale } = poseRef.current;
    const vh = window.innerHeight || 1;
    const outY = dy + Math.sign(dy || 1) * vh * 0.6;
    wrapper.style.transition = `transform ${ANIM_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
    wrapper.style.transform = `translate3d(${dx}px, ${outY}px, 0) scale(${scale})`;
  }, [wrapperRef]);

  return useMemo(
    () => ({ begin, move, release, cancel, flyOut }),
    [begin, move, release, cancel, flyOut],
  );
}
