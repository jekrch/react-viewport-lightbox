import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ViewerButtonProps {
  onClick: () => void;
  /** Accessible name (`aria-label`); also the tooltip unless `title` is given. */
  label: string;
  /** Tooltip text, when it should differ from `label` (e.g. "Close (Esc)"). */
  title?: string;
  /**
   * Toggle state, for buttons that open something (a drawer, a graph): `true`
   * adds `is-active` and sets `aria-pressed`. Leave it undefined for a plain
   * action button, which then carries no `aria-pressed` at all.
   */
  active?: boolean;
  disabled?: boolean;
  /** Extra class(es) after the base `rvl-btn`. */
  className?: string;
  children: ReactNode;
}

/**
 * A button styled like the viewer's own chrome (zoom, close), for your slots:
 * header actions, `renderNavStart`/`renderNavEnd` toggles. Stops click
 * propagation so a press never reaches the backdrop close, and keeps the
 * tooltip and accessible name in step. Restyle it through `classNames.button`
 * or the `--rvl-btn-*` custom properties rather than the class names.
 */
export function ViewerButton({
  onClick,
  label,
  title,
  active,
  disabled,
  className,
  children,
}: ViewerButtonProps) {
  return (
    <button
      type="button"
      className={cx("rvl-btn", active && "is-active", className)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
