import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus within `containerRef` while `active`, and restores focus to
 * the previously-focused element on deactivate/unmount. SSR-safe (effect only
 * runs in the browser).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    // Move focus into the dialog so screen readers/keyboard land inside it.
    // `preventScroll` so focusing never yanks the page — the overlay is fixed,
    // but the option also matters on the restore path below.
    container?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && (activeEl === first || activeEl === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger (the thumbnail) without scrolling it into
      // view. A bare `.focus()` scrolls a partially-off-screen thumbnail fully
      // on screen, which — because the trap deactivates the instant the close
      // begins — jerks the underlying page right before the collapse animation
      // plays. `preventScroll` keeps the page exactly where the user left it.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [containerRef, active]);
}
