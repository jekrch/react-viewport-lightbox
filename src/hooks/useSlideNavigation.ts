import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ViewerItem } from "../types";
import { resolveSlideDirection } from "./math";

/**
 * Run `cb` exactly once when `el` finishes its transition, or after `fallbackMs`
 * if `transitionend` never fires (an interrupted transition, or none set). No-op
 * when `el` is null.
 */
/**
 * Distance the track travels on a commit, in px. A letterboxed image sits
 * centered in a full-width track, so revealing a neighbor one *full* track
 * width away (translateX(±100%)) means the incoming image has to cross the
 * empty side margin before it even reaches the screen edge — in landscape,
 * with wide margins, it appears to lag far behind the outgoing image and then
 * rush to center. Sliding by the image width plus the near margin instead
 * (== vw − margin == (vw + imgW) / 2) starts the neighbor right at the screen
 * edge, so it enters immediately and both images travel the same distance at
 * the same speed. The neighbor panels are positioned at this same offset so the
 * committed slide lands them exactly centered.
 */
function measureSlideDistance(track: HTMLElement | null): number {
  const vw = track?.clientWidth || window.innerWidth;
  const img = track?.querySelector<HTMLElement>(".rvl-img-wrapper > img");
  const imgW = img?.offsetWidth ?? 0;
  if (!imgW) return vw;
  // Never exceed the full track width (a near-full-bleed image ⇒ ~vw, i.e. the
  // classic full-width carousel slide).
  return Math.min(vw, (vw + imgW) / 2);
}

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
  slideActive: boolean;
  slideAnimating: boolean;
  swipeOffset: number;
  swipeOffsetRef: React.MutableRefObject<number>;
  commitLockRef: React.MutableRefObject<boolean>;
  /**
   * Px distance the committed slide travels; also where the neighbor panels are
   * positioned so they land centered. See {@link measureSlideDistance}.
   */
  slideDistance: number;

  applySlideOffset: (offset: number, animate?: boolean) => void;
  commitSlide: (direction: "prev" | "next") => void;
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
  const swipeOffsetRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [slideAnimating, setSlideAnimating] = useState(false);
  const [slideActive, setSlideActive] = useState(false);
  const [slideDistance, setSlideDistance] = useState(0);
  const commitLockRef = useRef(false);

  const refreshSlideDistance = useCallback(() => {
    setSlideDistance(measureSlideDistance(slideTrackRef.current));
  }, []);

  // With loop on, every interior position has a neighbor in both directions as
  // long as there's more than one item to wrap to.
  const hasPrev = loop ? items.length > 1 : currentIndex > 0;
  const hasNext = loop ? items.length > 1 : currentIndex < items.length - 1;

  const applySlideOffset = useCallback((offset: number, animate = false) => {
    swipeOffsetRef.current = offset;
    const track = slideTrackRef.current;
    if (track) {
      track.style.transition = animate ? "transform 0.28s cubic-bezier(0.2, 0, 0, 1)" : "none";
      track.style.transform = `translateX(${offset}px)`;
    }
    setSwipeOffset(offset);
  }, []);

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

  const commitSlide = useCallback(
    (direction: "prev" | "next") => {
      if (commitLockRef.current || !readyRef.current) return;
      commitLockRef.current = true;
      readyRef.current = false;

      // Slide by the image-relative distance (see measureSlideDistance), and
      // pin the neighbor panels to that same offset so the committed slide lands
      // them exactly centered. Measured fresh here so a button/keyboard nav (no
      // preceding drag to prime it) still gets the right distance.
      const distance = measureSlideDistance(slideTrackRef.current);
      setSlideDistance(distance);
      const targetOffset = direction === "prev" ? distance : -distance;
      setSlideActive(true);
      setSlideAnimating(true);
      // Fire at the START of the slide so overlays (info drawers) can animate
      // out in sync with the image — onNavigate only fires once it completes.
      onSlideStart?.(direction);

      requestAnimationFrame(() => {
        applySlideOffset(targetOffset, true);

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
          400,
        );
      });
    },
    [applySlideOffset, currentIndex, items, onNavigate, onSlideStart, loop],
  );

  const resolveSlide = useCallback(
    (gestureStartTime: number) => {
      const action = resolveSlideDirection({
        offset: swipeOffsetRef.current,
        elapsedMs: Date.now() - gestureStartTime,
        viewportWidth: window.innerWidth,
        hasPrev,
        hasNext,
      });

      if (action === "prev") commitSlide("prev");
      else if (action === "next") commitSlide("next");
      else snapBack();
    },
    [hasPrev, hasNext, commitSlide, snapBack],
  );

  // DOM + swipe-state resets on navigation, applied together pre-paint. The
  // imperative track reset and the React state reset (offset/active/animating)
  // MUST land in the same frame the new index paints. Splitting them — DOM here,
  // state in a post-paint effect — left one painted frame where the track had
  // already snapped to translateX(0) but swipeOffset still held the committed
  // ±viewportWidth. In that frame showAdjacent was still true and
  // adjacentOpacity computed to 1, so the just-left image rendered at full
  // opacity one viewport-width to the side: a blink on the far edge, worst in
  // landscape with wide letterbox margins. Resetting state here (a synchronous
  // pre-paint re-render) removes that frame.
  useLayoutEffect(() => {
    const track = slideTrackRef.current;
    if (track) {
      track.style.transition = "none";
      track.offsetHeight;
      track.style.transform = "translateX(0px)";
    }
    swipeOffsetRef.current = 0;
    commitLockRef.current = false;
    setSwipeOffset(0);
    setSlideAnimating(false);
    setSlideActive(false);
  }, [currentIndex]);

  // Allow the next commit only after React has painted the new panel.
  useEffect(() => {
    readyRef.current = true;
  }, [currentIndex]);

  return {
    slideTrackRef,
    slideActive,
    slideAnimating,
    swipeOffset,
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
