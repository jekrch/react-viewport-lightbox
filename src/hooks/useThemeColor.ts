import { useEffect } from "react";

/**
 * Overrides the document's `<meta name="theme-color">` while `isActive` is true
 * (e.g. while the lightbox is open), so iOS Safari tints its chrome — the
 * status-bar strip on top and the home-indicator strip on the bottom — to match
 * the overlay instead of sampling the page behind it.
 *
 * Without an explicit theme-color, iOS Safari (and standalone PWAs) fall back to
 * sampling the `<body>`/document background color for those regions. The overlay
 * is a fixed layer on top of the body, not the body itself, so Safari would tint
 * those bands with the host app's background — the "wrong" color under and over
 * the viewer. Setting theme-color to the overlay color for the duration fixes it.
 *
 * The color is read from the `--rvl-theme-color` custom property on the root
 * element (default `#000` in styles.css), so it's themeable alongside the rest
 * of the overlay. theme-color must be opaque, which is why this uses a dedicated
 * var rather than the semi-transparent `--rvl-overlay-bg`.
 *
 * Restores the previous theme-color on close/unmount — reinstating the host
 * page's own tag, or removing the tag entirely if we created it — and
 * reference-counts concurrent activations so closing one overlay doesn't revert
 * a tint another still needs. Targets the non-`media` theme-color meta so
 * light/dark `media`-scoped tags are left untouched.
 *
 * SSR-safe: the effect only runs in the browser.
 */
let activeCount = 0;
let metaEl: HTMLMetaElement | null = null;
let createdMeta = false;
let previousContent = "";

export function useThemeColor(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;
    if (typeof document === "undefined") return;

    if (activeCount === 0) {
      const color =
        window
          .getComputedStyle(document.documentElement)
          .getPropertyValue("--rvl-theme-color")
          .trim() || "#000000";

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
    }
    activeCount += 1;

    return () => {
      activeCount -= 1;
      if (activeCount === 0 && metaEl) {
        if (createdMeta) {
          metaEl.remove();
        } else {
          metaEl.setAttribute("content", previousContent);
        }
        metaEl = null;
      }
    };
  }, [isActive]);
}
