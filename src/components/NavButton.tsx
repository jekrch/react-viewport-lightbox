import type { ReactNode } from "react";
import { cx } from "./cx";

interface NavButtonProps {
  direction: "prev" | "next";
  enabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  className?: string;
}

export function NavButton({ direction, enabled, onClick, icon, className }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (enabled) onClick();
      }}
      disabled={!enabled}
      className={cx("rvl-nav-btn", className)}
      aria-label={direction === "prev" ? "Previous image" : "Next image"}
    >
      {icon}
    </button>
  );
}
