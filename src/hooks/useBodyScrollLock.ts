import { useEffect } from "react";

/**
 * Locks scrolling on the document body while `isLocked` is true (e.g. while the
 * lightbox is open), so content behind the overlay can't be scrolled. To
 * prevent the content from shifting when the scrollbar disappears, the width
 * the scrollbar occupied is added back as right padding while locked. Restores
 * the previous overflow/padding values on unlock/unmount, and reference-counts
 * concurrent locks so closing one overlay doesn't release a lock held by
 * another.
 *
 * SSR-safe: the effect only runs in the browser, so importing this on the
 * server is a no-op.
 */
let lockCount = 0;
let previousOverflow = "";
let previousPaddingRight = "";

export function useBodyScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;
    if (typeof document === "undefined") return;

    if (lockCount === 0) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      previousOverflow = document.body.style.overflow;
      previousPaddingRight = document.body.style.paddingRight;

      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        const currentPaddingRight =
          parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
        document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
      }
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
      }
    };
  }, [isLocked]);
}
