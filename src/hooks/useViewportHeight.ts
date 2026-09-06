import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Full-viewport-height CSS term used before the overlay has been measured (and
 * on SSR / jsdom, where there is nothing to measure). `100dvh` where supported:
 * on mobile browsers with a collapsing URL bar, `100vh` is the LARGEST viewport
 * height, so while the bar is showing the image is sized against space that
 * isn't there and the layout is subtly too tall. `dvh` tracks the visible
 * viewport. Falls back to `100vh` on older browsers (a hydration style mismatch
 * is harmless because the viewer mounts on interaction).
 */
export const VIEWPORT_H_FALLBACK =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("height", "100dvh")
    ? "100dvh"
    : "100vh";

/**
 * The height the image should be sized against, as a CSS length term — the
 * measured height of the overlay root itself, in px, once it can be read.
 *
 * The image must fit the box it is centered in, and that box is the fixed
 * `inset: 0` root, NOT a viewport unit. On iOS Safari the two are different
 * things: a `position: fixed` element is laid out against the SMALL viewport
 * (the one with the toolbars showing — which is exactly why the backdrop has to
 * bleed past its edges to tint the toolbar bands, see `--rvl-chrome-bleed`),
 * while `100dvh` tracks the CURRENT viewport and equals the large one whenever
 * Safari has minimized its toolbars.
 *
 * That gap is what makes an open jerk. Scroll a long gallery down far enough for
 * Safari to collapse its toolbars and `dvh` is a toolbar-height taller than the
 * root, so the image opens oversized. Pinning the body for the scroll lock then
 * takes the document's scroll range away, Safari answers by snapping its
 * toolbars back out, `dvh` drops to the root's height, and the image resizes and
 * re-centers mid-flight — the lower edge visibly readjusting a beat after the
 * open. Opening at the top of the page never shows it: the toolbars are already
 * out, so `dvh` is already the root's height and nothing changes.
 *
 * Measuring the root closes the gap by construction, on every engine: the image
 * is sized to its actual container, so browser chrome coming and going either
 * doesn't move the container (iOS, where the fixed root is chrome-independent)
 * or moves image and bars together (engines that do resize fixed elements)
 * instead of the image overshooting and snapping back.
 *
 * A ResizeObserver keeps it current across rotation and real viewport changes.
 * No feedback loop: the root's height comes from its containing block, never
 * from the content being sized against it.
 */
export function useViewportHeight(rootRef: RefObject<HTMLElement | null>): string {
  const [height, setHeight] = useState<number | null>(null);

  // Measured before paint so the first frame is already sized to the root,
  // rather than laying out against the fallback unit and correcting after.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const h = el.getBoundingClientRect().height;
      // Sub-pixel churn would re-render on every observer callback for no
      // visible change; 0 means an unlaid-out (or jsdom) element, so hold the
      // fallback rather than collapsing the image to nothing.
      if (h > 0) setHeight((prev) => (prev !== null && Math.abs(prev - h) < 0.5 ? prev : h));
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootRef]);

  return height === null ? VIEWPORT_H_FALLBACK : `${height}px`;
}
