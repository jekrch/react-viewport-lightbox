import type { SVGProps } from "react";
import type { ViewerIcons } from "../types";

// Inline default icons so the package has no runtime icon dependency (e.g.
// lucide-react). Each is a 24x24 stroked glyph that inherits `currentColor`.
// Consumers can override any of them via the `icons` prop.

function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ZoomInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  );
}

export function ZoomOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8 11h6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base({ width: 36, height: 36, strokeWidth: 1.5, ...props })}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base({ width: 36, height: 36, strokeWidth: 1.5, ...props })}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** The full default icon set, merged with any consumer overrides. */
export const defaultIcons: ViewerIcons = {
  close: <CloseIcon />,
  zoomIn: <ZoomInIcon />,
  zoomOut: <ZoomOutIcon />,
  prev: <ChevronLeftIcon />,
  next: <ChevronRightIcon />,
};
