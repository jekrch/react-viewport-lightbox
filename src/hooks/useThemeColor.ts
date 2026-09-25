import { useEffect } from "react";

/**
 * Tints the iOS Safari chrome — the status-bar strip on top and the
 * home-indicator / toolbar band on the bottom — to match the overlay while
 * `isActive` is true (e.g. while the lightbox is open), instead of letting
 * Safari color those regions from the page behind the viewer.
 *
 * Safari's chrome-color sources differ by version, so the viewer covers all of
 * them. Safari 26 (iOS 26+) dropped `<meta name="theme-color">` and instead
 * detects a qualifying `position: fixed` element at the viewport edge — that
 * primary path is served by the `.rvl-chrome-tint` strips rendered by
 * ImageViewer (see styles.css). This hook covers the remaining sources, then
 * fires a scroll nudge so Safari re-evaluates them mid-session (see
 * `nudgeSafariResample`):
 *
 * 1. `<meta name="theme-color">` — honored by iOS 15–18 Safari and standalone
 *    PWAs; legacy support.
 * 2. The `<body>` and root (`<html>`) background colors — Safari 26's fallback
 *    when no fixed edge element qualifies, and what older Safari uses for the
 *    overscroll rubber-band areas. The overlay is a fixed layer that is *not*
 *    part of the document canvas, so without this override those paths read
 *    the host page's colors.
 *
 * The root-background swap is deferred until the open fade has completed: at
 * mount the backdrop is still transparent, and on a host page whose visible
 * background is painted by `<html>` (body transparent), swapping it
 * immediately would flash the page dark before the overlay covers it. After
 * the fade the backdrop is opaque enough that the swap is imperceptible.
 *
 * The color is read from the `--rvl-theme-color` custom property on the root
 * element (default `#000` in styles.css), so it's themeable alongside the rest
 * of the overlay. theme-color must be opaque, which is why this uses a
 * dedicated var rather than the semi-transparent `--rvl-overlay-bg`.
 *
 * Restores both overrides on unmount (not at close-start, so the chrome bands
 * don't flash the page color mid-close-fade) — reinstating the host page's own
 * meta tag, or removing the tag entirely if we created it — and
 * reference-counts concurrent activations so closing one overlay doesn't
 * revert a tint another still needs. Targets the non-`media` theme-color meta
 * so light/dark `media`-scoped tags are left untouched.
 *
 * SSR-safe: the effect only runs in the browser.
 */
let activeCount = 0;
let metaEl: HTMLMetaElement | null = null;
let createdMeta = false;
let previousContent = "";
let rootBgTimer: ReturnType<typeof setTimeout> | undefined;
let rootBgApplied = false;
let previousRootBg = "";
let previousBodyBg = "";

/**
 * iOS Safari samples the page for its chrome tint on scroll events and holds
 * the result until the next one. The locked page never scrolls on its own (the
 * scroll lock holds the offset exactly where it was), so whatever Safari last
 * sampled — the host page, from before the open — would stay frozen for the
 * whole session no matter what theme-color / canvas color / pixels say.
 *
 * This fires one real scroll event once the overlay is opaque: nudge the root
 * scroller a pixel off its held offset and back. Every on-screen layer is
 * `position: fixed` (the pinned body and the overlay), so nothing visibly
 * moves — but Safari resamples against the dark viewer. The nudge goes up where
 * it can, so it never needs range past the held bottom; a page too short to
 * scroll at all is lent 2px of temporary range, as a page at offset 0 still
 * needs somewhere to go. iOS-only: elsewhere it's dead weight, and a synthetic
 * window scroll could confuse host scroll listeners.
 */
function nudgeSafariResample(): void {
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.platform ?? "") ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  const root = document.documentElement;
  const heldY = window.scrollY;
  const previousMinHeight = root.style.minHeight;
  const lend = heldY < 1 && root.scrollHeight - root.clientHeight < 1;
  const lent = `${root.clientHeight + 2}px`;
  if (lend) root.style.minHeight = lent;
  window.scrollTo(0, heldY >= 1 ? heldY - 1 : heldY + 1);
  // Not canceled on cleanup: the callback must run to restore minHeight, and
  // the scroll-back is guarded so a close in this frame gap (after which the
  // scroll lock has restored the page's real offset) isn't yanked back.
  requestAnimationFrame(() => {
    if (activeCount > 0) window.scrollTo(0, heldY);
    // Only if still ours: a close in the gap has already put the root back.
    if (lend && root.style.minHeight === lent) root.style.minHeight = previousMinHeight;
  });
}

export function useThemeColor(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;
    if (typeof document === "undefined") return;

    if (activeCount === 0) {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const color = rootStyles.getPropertyValue("--rvl-theme-color").trim() || "#000000";

      metaEl = document.querySelector('meta[name="theme-color"]:not([media])');
      if (metaEl) {
        createdMeta = false;
        previousContent = metaEl.getAttribute("content") ?? "";
      } else {
        createdMeta = true;
        metaEl = document.createElement("meta");
        metaEl.setAttribute("name", "theme-color");
        document.head.appendChild(metaEl);
      }
      metaEl.setAttribute("content", color);

      // Swap the canvas color once the backdrop is opaque (fade duration plus
      // a frame or two of slack), so the change lands behind the overlay.
      const rawDuration = rootStyles.getPropertyValue("--rvl-anim-duration").trim();
      const parsed = parseFloat(rawDuration);
      const fadeMs = Number.isFinite(parsed)
        ? rawDuration.endsWith("ms")
          ? parsed
          : parsed * 1000
        : 250;
      rootBgTimer = setTimeout(() => {
        rootBgTimer = undefined;
        previousRootBg = document.documentElement.style.backgroundColor;
        previousBodyBg = document.body.style.backgroundColor;
        document.documentElement.style.backgroundColor = color;
        document.body.style.backgroundColor = color;
        rootBgApplied = true;
        nudgeSafariResample();
      }, fadeMs + 50);
    }
    activeCount += 1;

    return () => {
      activeCount -= 1;
      if (activeCount === 0) {
        if (rootBgTimer !== undefined) {
          clearTimeout(rootBgTimer);
          rootBgTimer = undefined;
        }
        // A pending nudge rAF is deliberately NOT canceled here: its callback
        // restores the temporary minHeight, and its scroll-back is already
        // guarded by activeCount, so letting it run is the safe path.
        if (rootBgApplied) {
          document.documentElement.style.backgroundColor = previousRootBg;
          document.body.style.backgroundColor = previousBodyBg;
          rootBgApplied = false;
        }
        if (metaEl) {
          if (createdMeta) {
            metaEl.remove();
          } else {
            metaEl.setAttribute("content", previousContent);
          }
          metaEl = null;
        }
      }
    };
  }, [isActive]);
}
