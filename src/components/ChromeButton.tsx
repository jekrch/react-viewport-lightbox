import type { ReactNode } from "react";
import { cx } from "./cx";

interface ChromeButtonProps {
  onClick: () => void;
  title: string;
  ariaLabel: string;
  /** Extra class(es) appended after the base `rvl-btn` (e.g. a variant + the consumer override). */
  className?: string;
  children: ReactNode;
}

/**
 * A chrome toolbar button (zoom in/out, reset, close). Stops click propagation
 * so a press on the top bar never bubbles to the backdrop close handler, and
 * keeps `title`/`aria-label` in lockstep across every toolbar control.
 */
export function ChromeButton({
  onClick,
  title,
  ariaLabel,
  className,
  children,
}: ChromeButtonProps) {
  return (
    <button
      type="button"
      className={cx("rvl-btn", className)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
