import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ViewerItem } from "../types";
import { resolveSlideDirection } from "./math";

/** Breathing room, in px, between the screen edge and the incoming image. */
const SLIDE_GAP = 24;

/** Easing for the commit/snap-back glide (track and fade). */
const SLIDE_EASE = "cubic-bezier(0.2, 0, 0, 1)";
/** Default commit/snap duration, used when no gesture velocity is known. */
const SLIDE_MS = 280;
/**
 * Bounds for the velocity-matched commit duration. A fast flick finishes the
 * slide quicker so the image feels like it keeps the finger's momentum instead
 * of detaching into a fixed-speed glide; a slow, deliberate release still gets
 * a soft landing. Clamped so a wild fling can't teleport and a crawl can't drag.
 */
const SLIDE_MS_MIN = 160;
const SLIDE_MS_MAX = 320;

/**
 * Commit duration for a slide released at `velocityPxMs` with `remainingPx`
 * still to travel: the time the finger itself would have needed, clamped to
 * the feel bounds. No velocity (button/keyboard nav) → the fixed default.
 */
function slideDurationMs(remainingPx: number, velocityPxMs?: number): number {
  if (!velocityPxMs || velocityPxMs <= 0) return SLIDE_MS;
  return Math.round(Math.min(SLIDE_MS_MAX, Math.max(SLIDE_MS_MIN, remainingPx / velocityPxMs)));
}

/**
 * Distance the track travels on a commit, in px; also where the neighbor panels
 * are positioned so the committed slide lands them centered.
 *
 * A letterboxed image sits centered in a full-width track. Sliding by a *full*
 * track width (translateX(±100%)) makes a wide-margin (e.g. landscape, or a
 * tall image on a portrait phone) neighbor cross all its empty side margin
 * before it even reaches the screen edge — it lags far behind the outgoing
 * image and then rushes in. Sliding by only `image width + margin` fixes that
 * but breaks when the neighbor is *wider* than the current image: sized to the
 * narrow current image, the wide neighbor pokes into the margin and appears
 * stuck to the current image's edge instead of emerging from the screen edge.
 *
 * So size the slide by the *widest* of the current image and its neighbors,
 * plus a gap: `vw/2` (image center → screen edge) + `maxW/2` (center → the
 * widest image's leading edge) + `SLIDE_GAP`. This guarantees the outgoing
 * image fully clears the screen AND the incoming one always rests just past the
 * screen edge with breathing room — never poking into the margin — whatever the
 * aspect ratios. Unloaded neighbors report width 0 and are skipped (they're
 * invisible until loaded; an onLoad re-measure catches them once they have a
 * size).
 */
function measureSlideDistance(track: HTMLElement | null): number {
  const vw = track?.clientWidth || window.innerWidth;
  if (!track) return vw;
  let maxW = 0;
  track.querySelectorAll<HTMLElement>(".rvl-img").forEach((img) => {
    if (img.offsetWidth > maxW) maxW = img.offsetWidth;
  });
  if (!maxW) return vw;
  return Math.min(vw + SLIDE_GAP, vw / 2 + maxW / 2 + SLIDE_GAP);
}

/**
 * Run `cb` exactly once when `el` finishes its transition, or after `fallbackMs`
 * if `transitionend` never fires (an interrupted transition, or none set). No-op
 * when `el` is null.
 */

/**
 * Run `cb` exactly once when `el` finishes its transition, or after `fallbackMs`
 * if `transitionend` never fires (an interrupted transition, or none set). No-op
 * when `el` is null.
 */
function onTransitionEndOnce(el: HTMLElement | null, cb: () => void, fallbackMs: number) {
  if (!el) return;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    el.removeEventListener("transitionend", run);
    cb();
  };
  el.addEventListener("transitionend", run, { once: true });
  setTimeout(run, fallbackMs);
}

export interface SlideNavigationState {
  slideTrackRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Refs to the prev/next neighbor panels. Their swipe-following fade is
   * written imperatively (style.opacity, alongside the track transform) so a
   * touchmove never re-renders the React tree; attach these so the fade has
   * elements to drive. Safe to leave unattached — the fade is skipped.
   */
  prevPanelRef: React.RefObject<HTMLDivElement | null>;
  nextPanelRef: React.RefObject<HTMLDivElement | null>;
  slideActive: boolean;
  slideAnimating: boolean;
  swipeOffsetRef: React.MutableRefObject<number>;
  commitLockRef: React.MutableRefObject<boolean>;
  /**
   * Px distance the committed slide travels; also where the neighbor panels are
   * positioned so they land centered. See {@link measureSlideDistance}.
   */
  slideDistance: number;

  /** `durationMs` only applies when `animate` is true; defaults to the fixed slide duration. */
  applySlideOffset: (offset: number, animate?: boolean, durationMs?: number) => void;
  /**
   * Play the committed slide. `velocityPxMs` (px/ms, from the releasing
   * gesture) finishes the slide at roughly the finger's pace, clamped to
   * feel bounds; omitted (button/keyboard nav) it uses the fixed duration.
   * Called while a commit is already in flight, it queues the flick to fire
   * once the new index paints instead of dropping it.
   */
  commitSlide: (direction: "prev" | "next", velocityPxMs?: number) => void;
  snapBack: () => void;
  resolveSlide: (gestureStartTime: number) => void;
  setSlideActive: React.Dispatch<React.SetStateAction<boolean>>;
  /** Measure the current image and refresh {@link slideDistance} (call at drag start). */
  refreshSlideDistance: () => void;
}

/**
 * Manages the three-slot slide carousel: swipe offset tracking, animated
 * commit/snap-back, and DOM resets on navigation.
 *
 * `items[i].src` is treated as a final, ready-to-load url — the next image is
 * preloaded/decoded before navigation commits so the swipe lands on a painted
 * frame.
 */
export function useSlideNavigation(
  items: ViewerItem[],
  currentIndex: number,
  onNavigate: (index: number) => void,
  onSlideStart?: (direction: "prev" | "next") => void,
  /** When true, navigation wraps around the ends instead of stopping. */
  loop = false,
): SlideNavigationState {
  const slideTrackRef = useRef<HTMLDivElement>(null);
  const prevPanelRef = useRef<HTMLDivElement>(null);
  const nextPanelRef = useRef<HTMLDivElement>(null);
  const swipeOffsetRef = useRef(0);
  const [slideAnimating, setSlideAnimating] = useState(false);
  const [slideActive, setSlideActive] = useState(false);
  const [slideDistance, setSlideDistance] = useState(0);
  // Mirrors `slideDistance` for the per-frame fade math: reading state there
  // would tie the fade to a re-render that deliberately never happens mid-drag.
  const slideDistanceRef = useRef(0);
  const commitLockRef = useRef(false);

  const updateSlideDistance = useCallback((distance: number) => {
    slideDistanceRef.current = distance;
    setSlideDistance(distance);
  }, []);

  const refreshSlideDistance = useCallback(() => {
    // A commit in flight has already locked the track's travel distance
    // imperatively (see commitSlide). A late neighbor `onLoad` re-measure here
    // would move the panel (via slideDistance state) but NOT the track target,
    // landing the incoming image off-center and snapping it to true center on
    // navigate. Freeze the distance until the commit clears the lock.
    if (commitLockRef.current) return;
    updateSlideDistance(measureSlideDistance(slideTrackRef.current));
  }, [updateSlideDistance]);

  // Re-measure once the neighbor panels have actually rendered (beginSlide's
  // priming pass ran before they mounted, so it only saw the current image).
  // useLayoutEffect lands the corrected distance before the first frame paints,
  // so there's no visible jump from the primed estimate.
  useLayoutEffect(() => {
    if (slideActive) refreshSlideDistance();
  }, [slideActive, refreshSlideDistance]);

  // With loop on, every interior position has a neighbor in both directions as
  // long as there's more than one item to wrap to.
  const hasPrev = loop ? items.length > 1 : currentIndex > 0;
  const hasNext = loop ? items.length > 1 : currentIndex < items.length - 1;

  // Fade the incoming neighbor in step with the drag: opacity ramps with the
  // swipe distance and clamps to 1 shortly before the slide fully commits, so
  // the reveal is a crossfade rather than a hard slide. Only the panel being
  // dragged toward shows; the opposite one is pinned to 0 so it can never
  // flash in. Written imperatively (style, not state) alongside the track
  // transform: the per-frame setState this replaced re-rendered the whole
  // viewer tree — consumer render slots included — on every touchmove.
  //
  // On commit/snap the offset jumps straight to its target, so the opacity
  // would snap in one frame — a flash, worst on a fast flick that never
  // dragged far enough to raise it much. `animate` glides it over the slide's
  // duration instead; a live drag passes false, so it tracks the finger
  // exactly.
  const applyAdjacentFade = useCallback((offset: number, animate: boolean, durationMs: number) => {
    const distance =
      slideDistanceRef.current || (typeof window === "undefined" ? 0 : window.innerWidth);
    const opacity = Math.min(1, Math.abs(offset) / (distance * 0.8 || 1));
    const transition = animate ? `opacity ${durationMs}ms ${SLIDE_EASE}` : "none";
    const prev = prevPanelRef.current;
    if (prev) {
      prev.style.transition = transition;
      prev.style.opacity = String(offset > 0 ? opacity : 0);
    }
    const next = nextPanelRef.current;
    if (next) {
      next.style.transition = transition;
      next.style.opacity = String(offset < 0 ? opacity : 0);
    }
  }, []);

  const applySlideOffset = useCallback(
    (offset: number, animate = false, durationMs = SLIDE_MS) => {
      swipeOffsetRef.current = offset;
      const track = slideTrackRef.current;
      if (track) {
        track.style.transition = animate ? `transform ${durationMs}ms ${SLIDE_EASE}` : "none";
        track.style.transform = `translateX(${offset}px)`;
      }
      applyAdjacentFade(offset, animate, durationMs);
    },
    [applyAdjacentFade],
  );

  const snapBack = useCallback(() => {
    setSlideAnimating(true);
    applySlideOffset(0, true);

    onTransitionEndOnce(
      slideTrackRef.current,
      () => {
        setSlideAnimating(false);
        setSlideActive(false);
      },
      350,
    );
  }, [applySlideOffset]);

  const readyRef = useRef(true);
  // A flick that lands while a commit is still in flight (animation or the
  // decode wait). Instead of dropping it — which made fast flick-flick-flick
  // paging feel like it stalled — remember the latest one and fire it the
  // moment the new index has painted. One slot: momentum is what matters, not
  // an exact queued count.
  const queuedFlickRef = useRef<"prev" | "next" | null>(null);

  const commitSlide = useCallback(
    (direction: "prev" | "next", velocityPxMs?: number) => {
      if (commitLockRef.current || !readyRef.current) {
        queuedFlickRef.current = direction;
        return;
      }
      commitLockRef.current = true;
      readyRef.current = false;

      // Slide by the image-relative distance (see measureSlideDistance), and
      // pin the neighbor panels to that same offset so the committed slide lands
      // them exactly centered. Measured fresh here so a button/keyboard nav (no
      // preceding drag to prime it) still gets the right distance.
      const distance = measureSlideDistance(slideTrackRef.current);
      updateSlideDistance(distance);
      const targetOffset = direction === "prev" ? distance : -distance;
      // Finish the slide at (clamped) gesture speed — see slideDurationMs.
      const remaining = Math.max(0, distance - Math.abs(swipeOffsetRef.current));
      const durationMs = slideDurationMs(remaining, velocityPxMs);
      setSlideActive(true);
      setSlideAnimating(true);
      // Fire at the START of the slide so overlays (info drawers) can animate
      // out in sync with the image — onNavigate only fires once it completes.
      onSlideStart?.(direction);

      requestAnimationFrame(() => {
        applySlideOffset(targetOffset, true, durationMs);

        onTransitionEndOnce(
          slideTrackRef.current,
          () => {
            let newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
            // Wrap the index when looping so the slide that just played lands on
            // the far end (e.g. last → first) instead of bailing out of bounds.
            if (loop) newIndex = (newIndex + items.length) % items.length;
            if (newIndex < 0 || newIndex >= items.length) {
              commitLockRef.current = false;
              return;
            }

            const newItem = items[newIndex];
            const preload = new Image();
            // Mirror the <img>'s srcset/sizes so the decode warms the exact
            // resource the panel will render, not just the fallback src.
            if (newItem.srcSet) {
              preload.srcset = newItem.srcSet;
              if (newItem.sizes) preload.sizes = newItem.sizes;
            }
            preload.src = newItem.src;

            const doNavigate = () => onNavigate(newIndex);

            // Add a timeout so a stalled decode can't block navigation forever
            const timeout = setTimeout(doNavigate, 300);
            preload
              .decode()
              .then(() => {
                clearTimeout(timeout);
                doNavigate();
              })
              .catch(() => {
                clearTimeout(timeout);
                doNavigate();
              });
          },
          durationMs + 120,
        );
      });
    },
    [applySlideOffset, updateSlideDistance, currentIndex, items, onNavigate, onSlideStart, loop],
  );

  const resolveSlide = useCallback(
    (gestureStartTime: number) => {
      const offset = swipeOffsetRef.current;
      const elapsedMs = Date.now() - gestureStartTime;
      const action = resolveSlideDirection({
        offset,
        elapsedMs,
        viewportWidth: window.innerWidth,
        hasPrev,
        hasNext,
      });

      // Mean gesture speed, handed to commitSlide so the slide finishes at
      // roughly the pace the finger set (a flick lands fast, a slow drag
      // glides). Same offset/elapsed proxy resolveSlideDirection flings on.
      const velocity = Math.abs(offset) / Math.max(elapsedMs, 1);
      if (action === "prev") commitSlide("prev", velocity);
      else if (action === "next") commitSlide("next", velocity);
      else snapBack();
    },
    [hasPrev, hasNext, commitSlide, snapBack],
  );

  // DOM + swipe-state resets on navigation, applied together pre-paint. The
  // imperative track reset and the React state reset (active/animating) MUST
  // land in the same frame the new index paints. Splitting them — DOM here,
  // state in a post-paint effect — left one painted frame where the track had
  // already snapped to translateX(0) but the neighbor panels (still mounted,
  // still at their committed opacity) rendered the just-left image at full
  // opacity one slide-distance to the side: a blink on the far edge, worst in
  // landscape with wide letterbox margins. Resetting state here (a synchronous
  // pre-paint re-render) unmounts the panels in the same frame the track snaps.
  useLayoutEffect(() => {
    const track = slideTrackRef.current;
    if (track) {
      track.style.transition = "none";
      track.offsetHeight;
      track.style.transform = "translateX(0px)";
    }
    swipeOffsetRef.current = 0;
    commitLockRef.current = false;
    setSlideAnimating(false);
    setSlideActive(false);
  }, [currentIndex]);

  // Allow the next commit only after React has painted the new panel, then
  // fire any flick that queued while the last commit was in flight — this is
  // what keeps rapid flick-flick-flick paging moving instead of eating every
  // gesture that landed mid-animation. Re-checked against the bounds at fire
  // time: the queued direction may have no target from the new index (e.g. a
  // "next" queued while sliding onto the last item).
  useEffect(() => {
    readyRef.current = true;
    const queued = queuedFlickRef.current;
    queuedFlickRef.current = null;
    if (queued === "prev" && hasPrev) commitSlide("prev");
    else if (queued === "next" && hasNext) commitSlide("next");
    // Keyed on the index ALONE. hasPrev/hasNext/commitSlide are read fresh from
    // the post-navigation render, but listing them would re-run this effect on
    // their identity churn (an inline `items` array re-creates commitSlide
    // every render) — setting readyRef mid-commit and unblocking double-commits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  return {
    slideTrackRef,
    prevPanelRef,
    nextPanelRef,
    slideActive,
    slideAnimating,
    swipeOffsetRef,
    commitLockRef,
    slideDistance,
    applySlideOffset,
    commitSlide,
    snapBack,
    resolveSlide,
    setSlideActive,
    refreshSlideDistance,
  };
}
