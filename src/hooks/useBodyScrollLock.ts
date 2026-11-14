import { useLayoutEffect } from "react";

/**
 * Locks scrolling on the document body while `isLocked` is true (e.g. while the
 * lightbox is open), so content behind the overlay can't be scrolled. Restores
 * the previous body styles on unlock/unmount, and reference-counts concurrent
 * locks so closing one overlay doesn't release a lock held by another.
 *
 * No horizontal shift: locking hides the root scrollbar, which widens the
 * viewport by the scrollbar's width. The pinned body is laid out with `left: 0`
 * and `right: <scrollbar width>`, so its containing width is exactly what it was
 * in flow — margins, padding, `box-sizing`, and a centered `max-width` body all
 * resolve to the same boxes, and nothing in the page moves. (Adding the width
 * back as body padding, the common approach, only holds for a full-width
 * `border-box` body with no margin.)
 *
 * `position: fixed` elements in the host page are laid out against the
 * viewport, not the body, so the lock can't hold them still on its own. It
 * publishes the width it compensates for as `--rvl-scrollbar-width` on the root
 * element while locked (`0px` when there's nothing to compensate), for them to
 * opt in: `padding-right: var(--rvl-scrollbar-width, 0px)` on a full-width bar,
 * `right: calc(1rem + var(--rvl-scrollbar-width, 0px))` on a corner button.
 *
 * The page is pinned with `position: fixed` and `top: -scrollY` rather than a
 * plain `overflow: hidden`. Overflow-only locking leaves the restored scroll
 * offset at the mercy of the browser: when the page is scrolled to (or near)
 * the bottom, hiding overflow collapses the scrollable range and the browser
 * clamps the offset, so on unlock the content visibly "skips" to a different
 * position. Pinning records the exact offset and restores it explicitly via
 * `scrollTo`, so the page holds still no matter where it was scrolled.
 *
 * Pinning alone takes the body out of flow, though, which collapses the
 * document to a single viewport: the scroll offset clamps to 0 and fires a
 * `scroll` event, and iOS Safari — which had minimized its toolbars on the way
 * down — snaps them back out, resizing the viewport. Both land in the middle of
 * the open animation, and both only when the page was scrolled, which is why an
 * open from the top of a long page is smooth and one from halfway down stutters:
 * the host page answers the scroll and the resize with its own work (a full
 * relayout at the least), and the flight drops frames under it. So the root
 * keeps the scroll height it had, via `min-height`, for as long as the body is
 * pinned. The offset never moves, no scroll event fires, and Safari has no
 * reason to touch its chrome. The body's `overflow: hidden` still propagates to
 * the viewport, so that retained range can't be scrolled by the user.
 *
 * The compensation is measured, not assumed: the root's width is read before
 * and after the lock hides the scrollbar, and the body is offset by exactly
 * what the viewport gained. So a root that keeps its scrollbar space anyway —
 * `scrollbar-gutter: stable`, or `overflow-y: scroll` on `<html>` (which the
 * body's `overflow` can't override) — gets no offset, where adding one would
 * itself shift the page. The measurement forces a layout, so it only runs when
 * the root has a space-taking scrollbar to begin with (`innerWidth` exceeds the
 * root's `clientWidth`) — never on touch devices or overlay-scrollbar desktops,
 * whose open path stays a single layout.
 *
 * Applied and released via `useLayoutEffect`, so the `position: fixed` toggle is
 * folded into a paint rather than landing a frame late. On iOS Safari that
 * toggle forces a full-page recomposite (and re-evaluates `loading="lazy"`
 * thumbnails behind the overlay); running it in a plain post-paint `useEffect`
 * let the page paint once in normal flow and then visibly reflow a frame later —
 * the background thumbnail "blinking out and in" as the viewer opens/closes.
 * Locking before the first paint (and releasing before the paint that starts the
 * close, see `!closing` at the call site) keeps that reflow off-screen.
 *
 * SSR-safe: the effect only runs in the browser, so importing this on the
 * server is a no-op.
 */
let lockCount = 0;
let previousOverflow = "";
let previousPosition = "";
let previousTop = "";
let previousLeft = "";
let previousRight = "";
let previousRootMinHeight = "";
let previousScrollbarVar = "";
let lockedScrollY = 0;
let compensation = 0;

/** Root-element custom property holding the scrollbar width a lock compensates for. */
export const SCROLLBAR_WIDTH_VAR = "--rvl-scrollbar-width";

/**
 * The scrollbar width (px) the active lock is compensating for: how much wider
 * the viewport became when the lock hid the root scrollbar. `0` when nothing is
 * locked, the scrollbar takes no space (overlay scrollbars, touch devices), or
 * the root keeps its scrollbar space while locked (`scrollbar-gutter: stable`,
 * `overflow-y: scroll` on `<html>`).
 */
export function getScrollLockCompensation(): number {
  return lockCount > 0 ? compensation : 0;
}

export function useBodyScrollLock(isLocked: boolean): void {
  useLayoutEffect(() => {
    if (!isLocked) return;
    if (typeof document === "undefined") return;

    if (lockCount === 0) {
      const root = document.documentElement;
      const widthBefore = root.clientWidth;
      const hasScrollbar = window.innerWidth > widthBefore;
      lockedScrollY = window.scrollY;
      // Read before the body is pinned, while it still has its real height.
      const scrollHeight = root.scrollHeight;
      previousRootMinHeight = root.style.minHeight;
      previousOverflow = document.body.style.overflow;
      previousPosition = document.body.style.position;
      previousTop = document.body.style.top;
      previousLeft = document.body.style.left;
      previousRight = document.body.style.right;
      previousScrollbarVar = root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR);
      // Pin the page at its current offset. `left`/`right` give the out-of-flow
      // body the containing width it had in flow — the viewport minus the
      // scrollbar it just lost (see above); `overflow: hidden` guards against a
      // stray scroll on the (now un-pinned) root.
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.left = "0px";
      document.body.style.right = "0px";
      // How much wider the viewport got from hiding the scrollbar (see above).
      compensation = hasScrollbar ? Math.max(0, root.clientWidth - widthBefore) : 0;
      if (compensation > 0) document.body.style.right = `${compensation}px`;
      root.style.setProperty(SCROLLBAR_WIDTH_VAR, `${compensation}px`);
      // Hold the scroll range the pinned body just vacated (see above).
      root.style.minHeight = `${scrollHeight}px`;
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        const root = document.documentElement;
        document.body.style.overflow = previousOverflow;
        document.body.style.position = previousPosition;
        document.body.style.top = previousTop;
        document.body.style.left = previousLeft;
        document.body.style.right = previousRight;
        root.style.minHeight = previousRootMinHeight;
        if (previousScrollbarVar) root.style.setProperty(SCROLLBAR_WIDTH_VAR, previousScrollbarVar);
        else root.style.removeProperty(SCROLLBAR_WIDTH_VAR);
        compensation = 0;
        // Restore the exact offset the page was pinned at — normally a no-op,
        // since the held range kept it, unless something scrolled meanwhile.
        window.scrollTo(0, lockedScrollY);
      }
    };
  }, [isLocked]);
}
