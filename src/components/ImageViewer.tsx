import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ImageViewerProps, ViewerContext, ViewerItem, ViewerRect } from "../types";
import { useImageZoomPan, MIN_SCALE, MAX_SCALE } from "../hooks/useImageZoomPan";
import { useSlideNavigation } from "../hooks/useSlideNavigation";
import { useGestureHandler } from "../hooks/useGestureHandler";
import { useBarMeasure } from "../hooks/useBarMeasure";
import { useBodyScrollLock, getScrollLockCompensation } from "../hooks/useBodyScrollLock";
import { useViewportHeight } from "../hooks/useViewportHeight";
import { useThemeColor } from "../hooks/useThemeColor";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useViewerHistory } from "../hooks/useViewerHistory";
import { useSwipeDismiss } from "../hooks/useSwipeDismiss";
import { cssDurationMs } from "../hooks/cssTime";
import {
  useSharedElementZoom,
  prefersReducedMotion,
  ANIM_MS,
  IMG_PADDING,
} from "../hooks/useSharedElementZoom";
import { defaultIcons } from "./icons";
import { NavButton } from "./NavButton";
import { ViewerButton } from "./ViewerButton";
import { cx } from "./cx";
import { defaultHintText } from "./hint";
import { prefetchItem, prefersSaveData } from "../prefetch";

// Window after open during which synthesized mouse click/dblclick are ignored.
// A tap (or double-tap) that opens the viewer fires iOS's synthesized `click` /
// `dblclick` a few hundred ms LATER — by which point this viewer has mounted
// under the finger, so they re-target onto it (the dblclick zooms the image,
// the click hits the backdrop and closes it). See GHOST guards below.
const GHOST_CLICK_MS = 700;

/** How long a tap waits for a second one before it counts as a single tap. */
const DOUBLE_TAP_MS = 300;

/** Named `stageShift` values: a full viewport out of view, up or down. */
const STAGE_SHIFTS: Record<string, string> = {
  up: "translateY(-100vh)",
  down: "translateY(100vh)",
};

/**
 * True when a key event belongs to a text field (a search box in a drawer,
 * say): typing "0" or an arrow there must not zoom, pan or navigate the image.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset", "image", "file", "color"].includes(
    type,
  );
}

const stopPropagation = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Zoom past which the image is swapped for a sharper source (zoomSrc / srcSet). */
const ZOOM_UPGRADE_AT = 1.5;

/** Fraction of the smaller viewport side one arrow key pans a zoomed image. */
const KEY_PAN_STEP = 0.1;

/**
 * How long past the exit animations the close's fallback timer waits for the
 * backdrop's transitionend. It covers the frames before the fade starts; it
 * only decides the unmount when no fade runs at all.
 */
const EXIT_SLACK_MS = 150;

/**
 * A callback whose identity never changes but always runs the latest closure,
 * so the actions handed to render slots stay referentially stable across
 * renders (consumers can list them as effect deps without churn).
 */
function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

/** A render slot's output, re-run only when the slot function or ctx changes. */
function useSlot<TData>(
  render: ((ctx: ViewerContext<TData>) => ReactNode) | undefined,
  ctx: ViewerContext<TData>,
): ReactNode {
  return useMemo(() => render?.(ctx), [render, ctx]);
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
  onCloseStart,
  onOpenComplete,
  onEscape,
  history: historyOption,
  stageShift,
  getOrigin,
  thumbnailCrop = true,
  zoom = true,
  zoomToCursor = true,
  wheel = "pan",
  tapToToggleChrome = false,
  showCounter = true,
  showZoomControls = true,
  disableNavigation = false,
  loop = false,
  closeOnBackdropClick = false,
  swipeToClose = true,
  preloadCount,
  renderHeader,
  renderHeaderActions,
  renderHeaderMeta,
  renderNavStart,
  renderNavEnd,
  navSlotPlacement = "edge",
  navHeight,
  navInset,
  counterFontSize,
  renderFooter,
  hint = false,
  renderOverlay,
  renderImageOverlay,
  renderError,
  accent,
  classNames,
  icons,
  ariaLabel,
}: ImageViewerProps<TData>) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Timestamp of this open, used to drop the iOS ghost click/dblclick that the
  // opening tap synthesizes onto the freshly mounted viewer (see GHOST_CLICK_MS).
  const openedAtRef = useRef(Date.now());
  const isGhostMouseEvent = useCallback(
    () => Date.now() - openedAtRef.current < GHOST_CLICK_MS,
    [],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const imgWrapperRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  const item = items[index];

  // The active item's src when it failed to load (shows the error state); the
  // src a retry is reloading (shows the spinner); and a key bumped by retry to
  // remount the <img>, so the browser fetches again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [retryingSrc, setRetryingSrc] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // A failure belongs to its item: navigating away clears it, and coming back
  // tries again (browsers don't cache a failed image).
  if (failedSrc !== null && failedSrc !== item?.src) setFailedSrc(null);
  const loadFailed = failedSrc !== null;
  // Nothing to zoom while the image is broken.
  const canZoom = zoom && !loadFailed;

  const hasPrevLinear = index > 0;
  const hasNextLinear = index < items.length - 1;
  const hasPrev = loop ? items.length > 1 : hasPrevLinear;
  const hasNext = loop ? items.length > 1 : hasNextLinear;

  // Keyed on the five icons rather than the `icons` object, so an inline object
  // literal doesn't rebuild the merge on every render.
  const {
    close: iconClose,
    zoomIn: iconZoomIn,
    zoomOut: iconZoomOut,
    prev: iconPrev,
    next: iconNext,
  } = icons ?? {};
  const mergedIcons = useMemo(
    () => ({
      close: iconClose ?? defaultIcons.close,
      zoomIn: iconZoomIn ?? defaultIcons.zoomIn,
      zoomOut: iconZoomOut ?? defaultIcons.zoomOut,
      prev: iconPrev ?? defaultIcons.prev,
      next: iconNext ?? defaultIcons.next,
    }),
    [iconClose, iconZoomIn, iconZoomOut, iconPrev, iconNext],
  );
  const cn = (slot: keyof NonNullable<ImageViewerProps["classNames"]>) => classNames?.[slot];

  // Release the scroll lock the instant the close begins — while the backdrop is
  // still opaque — rather than at unmount (after the fade), so the `position:
  // fixed` → static reflow it triggers on iOS Safari happens behind the cover
  // instead of blinking the revealed page. Held for the whole open lifetime
  // otherwise. Unlike the theme-color tint (kept to unmount so the chrome bands
  // don't flash mid-close), the scroll reflow is masked by the backdrop, so
  // releasing early is safe here.
  useBodyScrollLock(!closing);
  // Releasing the lock at close-start brings the page's scrollbar back, which
  // narrows this fixed `inset: 0` overlay by its width and would re-center the
  // fading image a few px to the left. So hold the overlay at its locked width
  // for the rest of the close: it runs under the returned scrollbar instead
  // (fixed boxes never paint over or scroll the root scrollbar). Declared after
  // the lock so the width is read once the lock is applied, and ahead of the
  // collapse effect so the FLIP measures the held layout. Skipped when another
  // lock is still holding the scrollbar away.
  const lockedGutterRef = useRef(0);
  useLayoutEffect(() => {
    if (!closing) {
      lockedGutterRef.current = getScrollLockCompensation();
      return;
    }
    const root = containerRef.current;
    if (root && lockedGutterRef.current > 0 && getScrollLockCompensation() === 0)
      root.style.right = `-${lockedGutterRef.current}px`;
  }, [closing]);
  // Tint the iOS Safari chrome (status-bar / home-indicator bands) to the
  // overlay color instead of letting it sample the page behind the viewer. The
  // tint is held for the whole mounted lifetime, so it isn't reverted
  // mid-close-animation (which would flash the page color into those bands);
  // only the page's root background goes back at close start, under the
  // still-dark backdrop, so the revealed page is its own color as it fades in.
  useThemeColor(true, closing);
  useFocusTrap(containerRef, visible && !closing);
  const { topBarH, bottomBarH } = useBarMeasure(topBarRef, bottomBarRef, index);
  // Size the image against the overlay's own box rather than a viewport unit, so
  // mobile browser chrome appearing/disappearing can't resize it out from under
  // the open animation (see useViewportHeight).
  const viewportH = useViewportHeight(containerRef);

  const zoomPan = useImageZoomPan(imgWrapperRef, index, canZoom, zoomToCursor, wheel);
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
    jumpTarget,
    handoff,
    endHandoff,
    refreshSlideDistance,
  } = slide;

  // The stage shift, as a CSS transform (null = centered).
  const shiftTransform = stageShift == null ? null : (STAGE_SHIFTS[stageShift] ?? stageShift);

  // Swipe-to-close. Off while the stage is shifted: the image is off-screen
  // under an overlay, and a vertical drag there belongs to the overlay.
  // handleCloseRef is assigned below; onDismiss only runs on a later release.
  const dismiss = useSwipeDismiss({
    enabled: swipeToClose && !shiftTransform && !closing,
    wrapperRef: imgWrapperRef,
    backdropRef,
    chromeRefs: [topBarRef, bottomBarRef],
    onDismiss: () => handleCloseRef.current(),
  });

  const gestures = useGestureHandler(
    zoomPan,
    slide,
    hasPrev,
    hasNext,
    canZoom,
    zoomToCursor,
    dismiss,
  );

  // Shared-element thumbnail zoom: expand out of / collapse back into the source
  // thumbnail, plus load-gating + the delayed loading spinner. See the hook.
  const {
    gateEntry,
    entrySettled,
    placeholderSrc,
    holdHidden,
    zoomTransition,
    showSpinner,
    collapsing,
    onImageLoad,
    onImageError,
    settleEntry,
    playCollapse,
  } = useSharedElementZoom({
    // The hook works on untyped items; the item it passes back is this
    // viewer's own, so the TData-typed callback is safe to hand over.
    getOrigin: getOrigin as
      ((index: number, item: ViewerItem) => HTMLElement | ViewerRect | null) | undefined,
    item,
    crop: thumbnailCrop,
    index,
    isZoomed,
    imgRef,
    imgWrapperRef,
    bottomBarRef,
    viewportH,
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

  // Warm the neighbors: whenever the active index changes, kick off a background
  // fetch AND decode of the images within `preloadCount` of it so a swipe/nav
  // to them draws from the browser's caches instead of waiting on the network.
  // The adjacent <img> panels only mount mid-swipe, so without this the first
  // frame of a button/keyboard move (or a fresh swipe) hits the wire cold — and
  // without the decode() the first swipe frame pays the (main-thread-visible)
  // decode of a full-size photo right as the gesture starts. Warming runs at
  // low fetch priority so it never competes with the active image on a
  // constrained connection, and backs off entirely under Save-Data unless the
  // consumer asked for a window explicitly. Requests go through prefetchItem,
  // so a source a tile hover already fetched isn't requested again.
  //
  // Keyed on the neighbors' source strings, not on `items` identity, so a
  // consumer that rebuilds `items` every render (`items={photos.map(…)}`)
  // doesn't tear down and restart the warm on each of those renders.
  const warmCount = Math.max(0, Math.floor(preloadCount ?? (prefersSaveData() ? 0 : 1)));
  const warmSources: [string, string | undefined, string | undefined][] = [];
  for (let d = 1; d <= warmCount; d++) {
    for (const j of [index - d, index + d]) {
      const k = loop ? ((j % items.length) + items.length) % items.length : j;
      const w = k !== index ? items[k] : undefined;
      if (w && !warmSources.some(([src]) => src === w.src)) {
        warmSources.push([w.src, w.srcSet, w.sizes]);
      }
    }
  }
  const warmKey = JSON.stringify(warmSources);
  // Sources known to be in the browser's caches: warmed neighbors, full images
  // a thumbnail-first open decoded off-DOM, and anything already shown. Gates
  // `decoding="sync"` on the active image (see there).
  const warmSrcsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [src, srcSet, sizes] of JSON.parse(warmKey) as typeof warmSources) {
      prefetchItem({ src, srcSet, sizes }, { priority: "low" });
      // Marked on request, not on decode: a swipe/button commit waits on its
      // own decode of the target before navigating, so by the time this src
      // becomes the active image it is decoded (or the commit timed out).
      warmSrcsRef.current.add(src);
    }
  }, [warmKey]);

  // A thumbnail-first open decodes the full image off-DOM before swapping it in
  // over the placeholder, so that src is warm by the time it renders.
  const activeSrc = item?.src;
  useEffect(() => {
    if (placeholderSrc && activeSrc) warmSrcsRef.current.add(activeSrc);
  }, [placeholderSrc, activeSrc]);
  const handleActiveImageLoad = useCallback(() => {
    if (!placeholderSrc && activeSrc) warmSrcsRef.current.add(activeSrc);
    setRetryingSrc(null);
    onImageLoad();
  }, [placeholderSrc, activeSrc, onImageLoad]);
  // Zoom-resolution upgrade: once a zoom past ZOOM_UPGRADE_AT settles, decode a
  // sharper source off-DOM (item.zoomSrc, else the srcSet candidate the zoomed
  // width calls for) and swap it in as a plain src. The box is pinned to its
  // size at the swap, so a source with a bigger intrinsic size can't resize it.
  // Only ever goes up; navigation drops it (keyed on the item's src).
  const [upgrade, setUpgrade] = useState<{ for: string; src: string; w: number; h: number }>();
  const upgraded = upgrade?.for === activeSrc ? upgrade : undefined;
  const upgradeWantRef = useRef({ for: "", width: 0 });
  const zoomSrc = item?.zoomSrc;
  const activeSrcSet = item?.srcSet;
  useEffect(() => {
    const img = imgRef.current;
    if (displayScale < ZOOM_UPGRADE_AT || !img || !activeSrc || placeholderSrc || loadFailed)
      return;
    if (!zoomSrc && !activeSrcSet) return;
    const t = setTimeout(() => {
      const width = Math.ceil(img.offsetWidth * displayScale);
      const want = upgradeWantRef.current;
      // zoomSrc is one fixed source: fetch it once. A srcSet re-asks per wider zoom.
      if (want.for === activeSrc && (zoomSrc || want.width >= width)) return;
      upgradeWantRef.current = { for: activeSrc, width };
      const probe = new Image();
      if (!zoomSrc) {
        probe.sizes = `${width}px`;
        probe.srcset = activeSrcSet!;
      }
      probe.src = zoomSrc ?? activeSrc;
      const box = { for: activeSrc, w: img.offsetWidth, h: img.offsetHeight };
      probe.decode().then(
        () => {
          const src = probe.currentSrc || probe.src;
          if (src !== img.currentSrc) setUpgrade({ ...box, src });
        },
        () => {},
      );
    }, 300);
    return () => clearTimeout(t);
  }, [displayScale, activeSrc, activeSrcSet, zoomSrc, placeholderSrc, loadFailed, imgRef]);

  // A landed slide's panel covers the active <img>'s src swap (see
  // useSlideNavigation's `handoff`) until the new image has decoded and a
  // frame has painted it; then the panel goes. Capped, so a slow decode can't
  // hold the panel (and the next queued flick) for long.
  useEffect(() => {
    if (!handoff) return;
    let raf = 0;
    let cancelled = false;
    const finish = () => {
      if (cancelled || raf) return;
      clearTimeout(timer);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(endHandoff);
      });
    };
    const timer = setTimeout(finish, 500);
    const img = imgRef.current;
    if (img && typeof img.decode === "function") img.decode().then(finish, finish);
    else finish();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [handoff, endHandoff, imgRef]);

  const handleActiveImageError = useCallback(() => {
    // A sharper source that won't load just falls back to the one shown before.
    if (upgraded) return setUpgrade(undefined);
    if (onImageError() && activeSrc) setFailedSrc(activeSrc);
    setRetryingSrc(null);
  }, [onImageError, activeSrc, upgraded]);
  const retry = useStableCallback(() => {
    setFailedSrc(null);
    setRetryingSrc(activeSrc ?? null);
    setRetryKey((k) => k + 1);
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const onEscapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  });
  // Back button / gesture: runs through onEscape first, like the Escape key, so
  // an open overlay can claim it. Returns true when claimed (viewer stays open).
  // handleCloseRef is assigned below; this only runs on a later popstate.
  const { release: releaseHistory } = useViewerHistory(
    historyOption,
    item,
    () => {
      if (onEscapeRef.current?.()) return true;
      handleCloseRef.current();
      return false;
    },
    // `paging: "push"`: back/forward landed on another item's entry. An overlay
    // can claim the press first, as with Escape; otherwise show that item.
    (itemId) => {
      if (onEscapeRef.current?.()) return false;
      const target = items.findIndex((it) => it.id === itemId);
      if (target !== -1 && target !== index) onIndexChange(target);
      return true;
    },
  );

  // A close can be requested more than once (Escape twice, a back press racing
  // the button); only the first runs, so onCloseStart / onClose fire once.
  const closingRef = useRef(false);
  // `then` (from ctx.close) runs once history is released; anything else
  // passed in (a click event from onClick={handleClose}) is ignored.
  const handleClose = useCallback(
    (then?: unknown) => {
      const after = typeof then === "function" ? (then as () => void) : undefined;
      if (closingRef.current) {
        releaseHistory(after);
        return;
      }
      closingRef.current = true;
      onCloseStart?.();
      releaseHistory(after);
      const reduce = prefersReducedMotion();
      // If the open zoom is still playing, settle the image to its resting pose
      // first so the collapse measures the real box, not a mid-flight transform.
      settleEntry();

      // Unmount once the slowest exit is done: the zoom/chrome (ANIM_MS) and the
      // backdrop's own, longer fade (--rvl-backdrop-out). Unmounting mid-fade cuts
      // the last of the darkness off in one frame, so the backdrop's transitionend
      // decides, not a timer started here: the fade only begins on the frame
      // after this close commits, and that commit does real work (the collapse
      // measures, the scroll-lock release reflows the page), which on a phone
      // can push the fade's end tens of ms past a timer's. The timer stays as a
      // fallback, with slack, for a fade that never runs (the backdrop already
      // at 0 after a long swipe, or a consumer's `transition: none`).
      const backdrop = backdropRef.current;
      const fadeMs = cssDurationMs(backdrop, "--rvl-backdrop-out", ANIM_MS);
      // Whichever comes first; the listener goes with the unmounted backdrop.
      let closed = false;
      const finish = () => {
        if (!closed) onClose();
        closed = true;
      };
      // Only a fade at least as long as the collapse can say the exit is over;
      // a consumer's quicker one leaves it to the timer.
      if (!reduce && fadeMs >= ANIM_MS)
        backdrop?.addEventListener("transitionend", (e) => {
          if (e.target === backdrop && e.propertyName === "opacity") finish();
        });

      setClosing(true);
      setVisible(false);

      // The collapse-into-thumbnail FLIP is played from the layout effect below,
      // *after* the `closing` commit releases the body scroll lock: releasing
      // `position: fixed` reflows the page (thumbnail back to its in-flow rect), so
      // measuring the collapse target here — before that reflow — would fly the
      // image to the locked-layout rect and then snap to the settled thumbnail on
      // unmount. Deferring lets the FLIP target the thumbnail's final resting box.
      setTimeout(finish, reduce ? 0 : Math.max(ANIM_MS, fadeMs) + EXIT_SLACK_MS);
    },
    [onClose, onCloseStart, releaseHistory, settleEntry],
  );
  const handleCloseRef = useRef(handleClose);
  useLayoutEffect(() => {
    handleCloseRef.current = handleClose;
  });

  // onOpenComplete: once the entry has settled. A thumbnail zoom reports its
  // own end (entrySettled, which also covers a zoom that couldn't play);
  // otherwise it's the CSS fade-in, which starts with `visible`. Not for a
  // viewer closed before then, and only once.
  const onOpenCompleteRef = useRef(onOpenComplete);
  useLayoutEffect(() => {
    onOpenCompleteRef.current = onOpenComplete;
  });
  const openCompletedRef = useRef(false);
  useEffect(() => {
    if (!visible || closing || openCompletedRef.current) return;
    const complete = () => {
      if (openCompletedRef.current || closingRef.current) return;
      openCompletedRef.current = true;
      onOpenCompleteRef.current?.();
    };
    if (gateEntry) {
      if (entrySettled) complete();
      return;
    }
    const fadeMs = Math.max(
      ANIM_MS,
      cssDurationMs(backdropRef.current, "--rvl-backdrop-in", ANIM_MS),
    );
    const t = setTimeout(complete, prefersReducedMotion() ? 0 : fadeMs);
    return () => clearTimeout(t);
  }, [visible, closing, gateEntry, entrySettled]);

  // Play the collapse once the close has committed and the scroll lock has
  // released. React runs layout-effect cleanups (the lock release) before
  // layout-effect setups, so by the time this fires the page has reflowed and
  // `playCollapse` measures the thumbnail's settled rect. A layout effect (not a
  // plain effect) keeps it pre-paint, so the FLIP starts on the same frame the
  // backdrop begins fading — no gap where the un-collapsed image is visible.
  useLayoutEffect(() => {
    // A swipe-to-close with no thumbnail to land in carries on off-screen.
    // A broken image has nothing to collapse; it fades with the track.
    if (closing && (loadFailed || !playCollapse())) dismiss.flyOut();
    // `closing` only ever flips false→true (the viewer then unmounts), so this
    // runs the collapse exactly once. Intentionally not keyed on playCollapse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  // While the stage is shifted, an overlay (drawer, graph, ...) fills the
  // viewport and the image is off-screen, so a tap on the "backdrop" is really a
  // tap on the overlay's empty space. Closing then would discard the overlay
  // along with the viewer, so backdrop close is off until the stage is back.
  const backdropCloses = closeOnBackdropClick && !shiftTransform;

  // tapToToggleChrome: a single tap or click hides/shows the bars. It waits
  // out the double-tap window (when zoom can claim a double tap) so a double
  // tap zooms without flickering the chrome. `pendingTap` holds that wait.
  const [chromeHidden, setChromeHidden] = useState(false);
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTouchEndRef = useRef(0);
  useEffect(() => () => clearTimeout(pendingTapRef.current), []);
  const registerTap = useCallback(
    (second: boolean) => {
      if (!tapToToggleChrome || closingRef.current) return;
      clearTimeout(pendingTapRef.current);
      const wasPending = pendingTapRef.current !== undefined;
      pendingTapRef.current = undefined;
      // The second tap of a double tap: that was a zoom, not a toggle.
      if (second || (wasPending && canZoom)) return;
      const toggle = () => {
        pendingTapRef.current = undefined;
        setChromeHidden((h) => !h);
      };
      if (canZoom) pendingTapRef.current = setTimeout(toggle, DOUBLE_TAP_MS);
      else toggle();
    },
    [tapToToggleChrome, canZoom],
  );

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
      lastTouchEndRef.current = Date.now();
      if (gestures.gestureMovedRef.current || e.touches.length > 0) return;
      if (backdropCloses && e.target === e.currentTarget) {
        e.preventDefault();
        handleClose();
        return;
      }
      registerTap(false);
    },
    [gestures, backdropCloses, handleClose, registerTap],
  );

  // A mouse click on the image (or the empty stage, when it doesn't close)
  // toggles the chrome. Skips the click a touch tap synthesizes (that tap was
  // already counted on touchend) and the end of a drag.
  const handleStageClick = useCallback(
    (e: React.MouseEvent) => {
      if (isGhostMouseEvent() || Date.now() - lastTouchEndRef.current < GHOST_CLICK_MS) return;
      if (gestures.gestureMovedRef.current) return;
      registerTap(e.detail > 1);
    },
    [gestures, isGhostMouseEvent, registerTap],
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      if (!backdropCloses) return handleStageClick(e);
      if (isGhostMouseEvent()) return;
      if (gestures.gestureMovedRef.current) return;
      handleClose();
    },
    [gestures, isGhostMouseEvent, handleClose, backdropCloses, handleStageClick],
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

  // Context actions: identity-stable for the viewer's whole life (see
  // useStableCallback), so the memoized ctx below only changes when a value a
  // slot can read changes.
  const goPrev = useStableCallback(() => navigate("prev"));
  const goNext = useStableCallback(() => navigate("next"));
  // A jump slides like a step (onNavigate, then the slide), with the target
  // in the neighbor panel on the side it lies. A zoom is dropped first.
  const goTo = useStableCallback((i: number) => {
    if (i === index || i < 0 || i >= items.length) return;
    if (transformRef.current.scale > 1) setTransform({ scale: 1, x: 0, y: 0 });
    commitSlide(i < index ? "prev" : "next", undefined, i);
  });
  const close = useStableCallback((then?: () => void) => handleClose(then));
  const zoomIn = useStableCallback(() => {
    const t = transformRef.current;
    const next = Math.min(MAX_SCALE, t.scale * 1.3);
    const clamped = clampTranslate(t.x, t.y, next);
    setTransform({ scale: next, ...clamped }, true);
  });
  const zoomOut = useStableCallback(() => {
    const t = transformRef.current;
    const next = Math.max(MIN_SCALE, t.scale / 1.3);
    const clamped = next <= 1 ? { x: 0, y: 0 } : clampTranslate(t.x, t.y, next);
    setTransform({ scale: next, ...clamped }, true);
  });

  // Keyboard: Escape closes (after the onEscape veto); `+`/`-`/`0` zoom;
  // arrows pan while zoomed and navigate otherwise; Home/End jump to the ends.
  const lastIndex = items.length - 1;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let the consumer dismiss its own overlay first; only close when the
        // veto hook declines to handle the key.
        if (onEscape?.()) return;
        handleClose();
        return;
      }
      if (closingRef.current || isEditableTarget(e.target)) return;
      // Leave browser shortcuts (Ctrl/Cmd +, Alt+Arrow, …) to the browser.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const t = transformRef.current;
      const zoomed = t.scale > 1;
      // Zoom keys need the image on screen: not while an overlay has shifted
      // the stage out of view.
      if (canZoom && !shiftTransform) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoomIn();
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomOut();
          return;
        }
        if (e.key === "0") {
          if (zoomed) {
            e.preventDefault();
            resetTransform();
          }
          return;
        }
      }

      if (zoomed) {
        const step = Math.round(Math.min(window.innerWidth, window.innerHeight) * KEY_PAN_STEP);
        // Arrow toward the part of the image you want to see: Left reveals
        // the left side, so the image moves right.
        const pan: Record<string, [number, number]> = {
          ArrowLeft: [step, 0],
          ArrowRight: [-step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        };
        const d = pan[e.key];
        if (d) {
          e.preventDefault();
          const clamped = clampTranslate(t.x + d[0], t.y + d[1], t.scale);
          setTransform({ scale: t.scale, ...clamped }, "transform 0.15s ease-out");
        }
        return;
      }

      if (disableNavigation) return;
      if (e.key === "ArrowLeft" && hasPrev) navigate("prev");
      else if (e.key === "ArrowRight" && hasNext) navigate("next");
      else if (e.key === "Home" && index !== 0) {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End" && index !== lastIndex) {
        e.preventDefault();
        goTo(lastIndex);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    handleClose,
    hasPrev,
    hasNext,
    navigate,
    onEscape,
    disableNavigation,
    canZoom,
    shiftTransform,
    zoomIn,
    zoomOut,
    resetTransform,
    transformRef,
    clampTranslate,
    setTransform,
    goTo,
    index,
    lastIndex,
  ]);

  // Memoized so the viewer's own re-renders (swipe start/settle, slide-distance
  // measurement, load gating, …) hand slots the SAME ctx, and the slot output
  // memos below skip re-running consumer render functions for them.
  const total = items.length;
  const ctx = useMemo<ViewerContext<TData>>(
    () => ({
      items,
      index,
      item: item!,
      total,
      closing,
      hasPrev,
      hasNext,
      goPrev,
      goNext,
      goTo,
      close,
      isZoomed,
      displayScale,
      zoomIn,
      zoomOut,
      resetZoom: resetTransform,
      isTouchDevice,
      chromeHidden,
      topBarHeight: topBarH,
      bottomBarHeight: bottomBarH,
    }),
    [
      items,
      index,
      item,
      total,
      closing,
      hasPrev,
      hasNext,
      goPrev,
      goNext,
      goTo,
      close,
      isZoomed,
      displayScale,
      zoomIn,
      zoomOut,
      resetTransform,
      isTouchDevice,
      chromeHidden,
      topBarH,
      bottomBarH,
    ],
  );

  // Slot output, memoized on (render fn, ctx). A consumer re-render passes new
  // render functions and re-runs them as before; a viewer-internal re-render
  // reuses the same element, which React skips reconciling entirely — so a
  // swipe no longer re-renders a heavy overlay (drawer, graph) twice per slide.
  const header = useSlot(renderHeader, ctx);
  const headerActions = useSlot(renderHeaderActions, ctx);
  const headerMeta = useSlot(renderHeaderMeta, ctx);
  const navStart = useSlot(renderNavStart, ctx);
  const navEnd = useSlot(renderNavEnd, ctx);
  const footer = useSlot(renderFooter, ctx);
  const overlay = useSlot(renderOverlay, ctx);
  const imageOverlay = useSlot(renderImageOverlay, ctx);
  const errorContent = useMemo(
    () =>
      !loadFailed ? null : renderError ? (
        renderError(ctx, retry)
      ) : (
        <>
          <p className="rvl-error-text">Couldn't load image</p>
          <button type="button" className="rvl-btn rvl-error-retry" onClick={retry}>
            Retry
          </button>
        </>
      ),
    [loadFailed, renderError, ctx, retry],
  );
  const hintContent = useMemo(
    () =>
      typeof hint === "function"
        ? hint(ctx)
        : hint
          ? defaultHintText({
              isTouchDevice: ctx.isTouchDevice,
              multiple: ctx.hasPrev || ctx.hasNext,
              navigation: !disableNavigation,
              zoom,
              dismiss: swipeToClose,
              wheelZooms: wheel === "zoom",
            })
          : null,
    [hint, ctx, disableNavigation, zoom, swipeToClose, wheel],
  );

  // A viewer that mounts already shifted (e.g. opened straight onto a drawer)
  // must start in place, not slide there from center: the first render's shift
  // snaps, later changes animate. Read in render on purpose — it only gates
  // the CSS transition, and it's false for every render before the mount
  // commits (StrictMode's double render included).
  //
  // A shift cleared as a slide starts (a drawer closed from onNavigate) snaps
  // back too: the next image then slides in level instead of dropping in on a
  // diagonal, and the overlay that's leaving still covers the jump.
  const shiftMountedRef = useRef(false);
  useEffect(() => {
    shiftMountedRef.current = true;
  }, []);
  const shiftAnimate = shiftMountedRef.current && !(slideAnimating && !shiftTransform);

  // After the first slide change, each new image's overlay remounts (keyed on
  // the index) with a quick fade-in, instead of its content swapping in place.
  const openIndexRef = useRef(index);
  const navigatedRef = useRef(false);
  useLayoutEffect(() => {
    if (index !== openIndexRef.current) navigatedRef.current = true;
  }, [index]);
  const imageOverlayEnters = navigatedRef.current || index !== openIndexRef.current;

  if (!item) return null;

  const reservedH = bottomBarH + IMG_PADDING * 2;
  const imgMaxHeight = `calc(${viewportH} - ${reservedH}px)`;
  const imgStyle: React.CSSProperties = { maxHeight: imgMaxHeight };

  // Numbers become px; strings pass through (e.g. "1.5rem"). Only emit vars that
  // were supplied so the stylesheet defaults still apply otherwise.
  const dim = (v: number | string) => (typeof v === "number" ? `${v}px` : v);
  const rootStyle: React.CSSProperties = {
    ...(navHeight != null && { "--rvl-nav-height": dim(navHeight) }),
    ...(navInset != null && { "--rvl-nav-inset": dim(navInset) }),
    ...(counterFontSize != null && { "--rvl-counter-font-size": dim(counterFontSize) }),
    ...(accent && { "--rvl-accent": accent }),
  } as React.CSSProperties;
  // Keep the image hidden (but laid out, so the zoom can still measure its box)
  // until something decoded is ready to show, so the entry plays from the
  // thumbnail with no full-size flash. opacity, not display, to preserve the
  // layout box.
  // A broken image stays laid out but unseen (no broken-image icon or alt text);
  // the error state shows in its place.
  const activeImgStyle: React.CSSProperties = loadFailed
    ? { ...imgStyle, visibility: "hidden" }
    : holdHidden
      ? { ...imgStyle, opacity: 0 }
      : upgraded
        ? { ...imgStyle, width: upgraded.w, height: upgraded.h }
        : imgStyle;
  // Image-overlay content (a badge) comes and goes with the chrome: it fades in
  // alongside the bars as the viewer opens and out as soon as a close starts,
  // rather than lingering while the image collapses away. Also held while the
  // image itself is (a slow load), so it never floats over the spinner.
  const imageOverlayShown = visible && !closing && !holdHidden && !loadFailed;

  const totalDigits = String(items.length).length;
  const counterMinWidth = `${totalDigits * 2 * 0.6 + 1.5}em`;

  // Three-slot carousel neighbors. When looping, the slots at the ends point at
  // the wrap-around items (last ↔ first) so the wrapping slide has a real image
  // to reveal instead of an empty panel.
  // A goTo jump puts its target in the panel on the side it slides from.
  const jumpsBack = jumpTarget != null && jumpTarget < index;
  const prevIndex = jumpsBack
    ? jumpTarget
    : hasPrevLinear
      ? index - 1
      : hasPrev
        ? items.length - 1
        : -1;
  const nextIndex =
    jumpTarget != null && !jumpsBack ? jumpTarget : hasNextLinear ? index + 1 : hasNext ? 0 : -1;
  // During a hand-off only the panel that slid in stays, showing the item it
  // carried (now the active one), so its painted image is untouched. Not while
  // closing: it would hold a still copy over the collapsing image.
  const handingOff = handoff && !closing ? handoff : null;
  const prevItem = handingOff
    ? handingOff === "prev"
      ? item
      : null
    : prevIndex >= 0
      ? items[prevIndex]
      : null;
  const nextItem = handingOff
    ? handingOff === "next"
      ? item
      : null
    : nextIndex >= 0
      ? items[nextIndex]
      : null;
  const showAdjacent = slideActive || slideAnimating || !!handingOff;
  // Neighbors sit `slideDistance` px to the side (see measureSlideDistance),
  // which starts their image right at the screen edge, so they slide in from the
  // edge as the track shifts. Falls back to the full viewport width before the
  // first measurement lands (classic full-width slot), matching the old
  // translateX(±100%) behavior. Their swipe-following crossfade is NOT rendered
  // here: useSlideNavigation writes it straight to the panels' style (via
  // prevPanelRef/nextPanelRef) alongside the track transform, so a touchmove
  // never re-renders this tree. Keep opacity/transition out of the style prop
  // below or React would clobber those writes on unrelated re-renders.
  const adjacentOffset = slideDistance || (typeof window === "undefined" ? 0 : window.innerWidth);

  // Never show the zoom controls while the image is shifted out of view (a
  // details pane pushed in via stageShift): the image isn't on screen, so
  // zooming it makes no sense.
  const showZoomCtrls = canZoom && !isTouchDevice && showZoomControls && !shiftTransform;
  const hasNavGroup = hasPrev || hasNext;
  const showNavRow = !isZoomed && (hasNavGroup || navStart != null || navEnd != null);

  const headerActionsRow = (
    <div className="rvl-header-actions">
      {headerActions}

      {showZoomCtrls && isZoomed && (
        <ViewerButton
          className={cx("rvl-btn-scale", cn("button"))}
          onClick={resetTransform}
          label="Reset zoom"
        >
          {Math.round(displayScale * 100)}%
        </ViewerButton>
      )}

      {showZoomCtrls && (
        <ViewerButton className={cn("button")} onClick={zoomIn} label="Zoom in">
          {mergedIcons.zoomIn}
        </ViewerButton>
      )}

      {showZoomCtrls && (
        <ViewerButton className={cn("button")} onClick={zoomOut} label="Zoom out">
          {mergedIcons.zoomOut}
        </ViewerButton>
      )}

      <ViewerButton
        className={cn("button")}
        onClick={handleClose}
        label="Close"
        title="Close (Esc)"
      >
        {mergedIcons.close}
      </ViewerButton>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cx(
        "rvl-root",
        visible && !closing && "rvl-visible",
        chromeHidden && "rvl-chrome-hidden",
        cn("root"),
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? item.alt ?? "Image viewer"}
      tabIndex={-1}
      style={rootStyle}
    >
      <div
        ref={backdropRef}
        className={cx("rvl-backdrop", cn("backdrop"))}
        onClick={backdropCloses ? handleBackdropClick : undefined}
        onTouchEnd={backdropCloses ? handleBackdropTouchEnd : undefined}
        aria-hidden="true"
      />

      {/* Safari 26 chrome tint sources: iOS 26 dropped theme-color and instead
          colors its status-bar / toolbar chrome from a `position: fixed`
          element at the viewport edge (top: 0 / bottom: 0, full width, ≥6px
          tall, opaque background, no opacity/transform/negative-z — all of
          which disqualify the transparent root and the translateZ'd backdrop).
          These strips exist purely to be that detected element. */}
      <div className="rvl-chrome-tint rvl-chrome-tint-top" aria-hidden="true" />
      <div className="rvl-chrome-tint rvl-chrome-tint-bottom" aria-hidden="true" />

      <div ref={topBarRef} className={cx("rvl-bar", "rvl-top-bar", cn("topBar"))}>
        <div className={cx("rvl-header", cn("header"))}>{header}</div>

        {renderHeaderMeta ? (
          // A second row under the actions (wrapped only when the slot is in
          // use, so the bar's DOM is unchanged otherwise). In flow, so the
          // measured topBarHeight includes it.
          <div className="rvl-header-end">
            {headerActionsRow}
            {headerMeta != null && headerMeta !== false && (
              <div className={cx("rvl-header-meta", cn("headerMeta"))}>{headerMeta}</div>
            )}
          </div>
        ) : (
          headerActionsRow
        )}
      </div>

      <div
        className="rvl-stage"
        style={{
          transform: shiftTransform ?? "translateY(0)",
          // animate=false snaps with no transition (overrides the CSS transition)
          transition: shiftAnimate ? undefined : "none",
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
          onClick={backdropCloses || tapToToggleChrome ? handleTrackClick : undefined}
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
              // At center while handing off: the track has snapped back to 0,
              // so this keeps the panel exactly where the slide left it.
              style={{
                transform: `translateX(${handingOff === "prev" ? 0 : -adjacentOffset}px)`,
              }}
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
            onClick={(e) => {
              e.stopPropagation();
              if (tapToToggleChrome) handleStageClick(e);
            }}
            onDoubleClick={handleDoubleClickGuarded}
          >
            <img
              ref={imgRef}
              // A retry remounts the element so the browser fetches again.
              key={`img-${retryKey}`}
              // While a placeholder stands in (thumbnail-first open), it's the
              // whole source: a srcset would outrank it. The full image swaps
              // in, already decoded, once ready (see useSharedElementZoom).
              // A zoom upgrade, like a placeholder, is the whole source.
              src={upgraded?.src ?? placeholderSrc ?? item.src}
              srcSet={upgraded || placeholderSrc ? undefined : item.srcSet}
              sizes={upgraded || placeholderSrc ? undefined : item.sizes}
              alt={item.alt ?? ""}
              // `sync` for a warm src, so a navigation src-swap presents the new
              // image atomically with the same-frame DOM changes around it. On a
              // committed swipe the adjacent panel (which showed the sliding
              // image) unmounts and this element takes over at center in one
              // pre-paint frame; `async` lets the browser paint that frame
              // WITHOUT the freshly-swapped image and fill it in a frame later —
              // a blank hand-off frame that reads as a blink at the end of the
              // swipe. A swiped-to image is always warmed first (neighbor
              // prefetch + the pre-navigate decode in useSlideNavigation), so
              // the sync decode is a cache hit and adds no jank. A cold src (a
              // deep-linked open, a `goTo` jump) would instead block the main
              // thread on a full-size decode, and buys nothing: an uncached src
              // paints blank until its bytes arrive whatever `decoding` says.
              // The placeholder itself comes from an already-loaded tile.
              // An upgrade was decoded off-DOM first, so it's warm too.
              decoding={
                upgraded || placeholderSrc || warmSrcsRef.current.has(item.src) ? "sync" : "async"
              }
              className={cx("rvl-img", cn("image"))}
              style={activeImgStyle}
              draggable={false}
              onLoad={handleActiveImageLoad}
              onError={handleActiveImageError}
            />
            {imageOverlay != null && (
              <div
                key={`overlay-${index}`}
                className={cx(
                  "rvl-image-overlay",
                  imageOverlayShown && "rvl-image-overlay-shown",
                  imageOverlayEnters && "rvl-image-overlay-enter",
                  cn("imageOverlay"),
                )}
              >
                {imageOverlay}
              </div>
            )}
          </div>

          {(showSpinner || (retryingSrc !== null && retryingSrc === activeSrc)) && (
            <div className={cx("rvl-spinner", cn("spinner"))} role="status" aria-label="Loading">
              <span className="rvl-spinner-ring" aria-hidden="true" />
            </div>
          )}

          {errorContent != null && errorContent !== false && (
            // Taps here are for the error UI (Retry), not the track's gestures
            // or its backdrop close.
            <div
              className={cx("rvl-error", cn("error"))}
              role="alert"
              onClick={stopPropagation}
              onPointerDown={stopPropagation}
              onTouchStart={stopPropagation}
              onTouchEnd={stopPropagation}
            >
              {errorContent}
            </div>
          )}

          {showAdjacent && nextItem && (
            <div
              ref={nextPanelRef}
              className="rvl-adjacent"
              // See prev panel above: positioned `adjacentOffset` px to the
              // right (image just past the right screen edge); opacity is
              // swipe-driven imperatively.
              style={{
                transform: `translateX(${handingOff === "next" ? 0 : adjacentOffset}px)`,
              }}
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

        {renderFooter && <div className="rvl-footer">{footer}</div>}

        {/* Gesture hints describe the image, so they go while it's zoomed (the
            user has found zoom) or shifted off-screen under an overlay. Faded
            rather than unmounted: the line keeps its space, so the nav row and
            the image's reserved height (bottomBarH) don't jump as it goes. */}
        {hintContent != null && hintContent !== false && (
          <div
            className={cx(
              "rvl-hint",
              (isZoomed || !!shiftTransform) && "rvl-hint-hidden",
              cn("hint"),
            )}
            aria-hidden={isZoomed || !!shiftTransform || undefined}
          >
            <span>{hintContent}</span>
          </div>
        )}
      </div>

      {renderOverlay && <div className={cx("rvl-overlay", cn("overlay"))}>{overlay}</div>}

      {/* Announces each navigation to screen readers. Live regions speak on
          change, not on mount, so opening stays covered by the dialog label. */}
      <div className="rvl-sr-only" aria-live="polite" aria-atomic="true">
        {items.length > 1 &&
          `Image ${index + 1} of ${items.length}${item.alt ? `: ${item.alt}` : ""}`}
      </div>
    </div>
  );
}
