import { useEffect } from "react";

/**
 * Tints the iOS Safari chrome — the status-bar strip on top and the
 * home-indicator / toolbar band on the bottom — to match the overlay while
 * `isActive` is true (e.g. while the lightbox is open), instead of letting
 * Safari color those regions from the page behind the viewer.
 *
 * Safari derives the chrome color from several sources, so this hook overrides
 * two of them for the duration (the third — live pixels under the translucent
 * bars — is handled in CSS by the backdrop's `--rvl-chrome-bleed` overdraw):
 *
 * 1. `<meta name="theme-color">` — the declared tint, honored in some bar
 *    states (e.g. the minimized/compact toolbar).
 * 2. The root element's background color — Safari falls back to the document
 *    canvas color for the status-bar strip and overscroll areas, and the
 *    canvas is painted by `<html>`'s background. The overlay is a fixed layer
 *    that is *not* part of the canvas, so without this override Safari can
 *    tint the top strip with whatever host content sits at the sampled spot.
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
        document.documentElement.style.backgroundColor = color;
        rootBgApplied = true;
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
        if (rootBgApplied) {
          document.documentElement.style.backgroundColor = previousRootBg;
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
