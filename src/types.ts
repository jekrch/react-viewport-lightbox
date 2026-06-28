import type { ReactNode } from "react";

/**
 * A single image in the viewer. Neutral replacement for app-specific item
 * types (e.g. `Panel` / `Organism`).
 */
export interface ViewerItem {
  id: string;
  /** FINAL url — the consumer resolves any base path before passing it in. */
  src: string;
  alt?: string;
  /** Optional thumbnail url; falls back to `src`. */
  thumbnail?: string;
}

/** Named, themeable regions of the viewer that accept a `className` override. */
export type ViewerSlot =
  | "root"
  | "backdrop"
  | "topBar"
  | "bottomBar"
  | "image"
  | "button"
  | "counter"
  | "navButton"
  | "navStart"
  | "navEnd"
  | "overlay";

/** Overridable control icons. Each is a React node rendered inside its button. */
export interface ViewerIcons {
  close: ReactNode;
  zoomIn: ReactNode;
  zoomOut: ReactNode;
  prev: ReactNode;
  next: ReactNode;
}

/**
 * Context object handed to every render slot. Exposes navigation, zoom, and
 * layout-measurement state so slot content (info drawers, graphs, custom
 * headers) can coordinate with the viewer.
 */
export interface ViewerContext {
  items: ViewerItem[];
  index: number;
  item: ViewerItem;
  total: number;

  hasPrev: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  goTo: (index: number) => void;
  close: () => void;

  isZoomed: boolean;
  displayScale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  isTouchDevice: boolean;

  /**
   * Measured bar heights so overlays (info drawers) can size themselves
   * between the bars.
   */
  topBarHeight: number;
  bottomBarHeight: number;

  /**
   * Lets an overlay push the image track up/down (drawer-open behavior).
   * Pass a CSS transform string, or `null` to reset. `animate` defaults to
   * `true`; pass `false` to apply the shift instantly with no transition — e.g.
   * to snap the image back to center on navigation so it slides in horizontally
   * instead of dropping down.
   */
  setContentShift: (transform: string | null, animate?: boolean) => void;
}

export interface ImageViewerProps {
  items: ViewerItem[];
  /** Controlled index of the active item. */
  index: number;
  onIndexChange: (index: number) => void;
  /**
   * Fired when a slide STARTS (button, key, or swipe), before the animation and
   * the resulting `onIndexChange`. Lets overlays (e.g. an info drawer) animate
   * out in sync with the image. `direction` is the swipe direction.
   */
  onNavigate?: (direction: "prev" | "next") => void;
  /** Called AFTER the exit animation completes. */
  onClose: () => void;

  // Behavior
  /** Enable zoom/pan (wheel, pinch, double-tap). Default `true`. */
  zoom?: boolean;
  /** Reserved for a future thumbnail strip. Default `false`. */
  showThumbnails?: boolean;
  /** Show the `index / total` counter. Default `true`. */
  showCounter?: boolean;
  /** Wrap around at the ends. Default `false`. */
  loop?: boolean;

  // Slots (all receive ViewerContext)
  /** Top-left title area. */
  renderHeader?: (ctx: ViewerContext) => ReactNode;
  /** Extra top-right buttons, rendered before the close button. */
  renderHeaderActions?: (ctx: ViewerContext) => ReactNode;
  /**
   * Pinned to the LEFT edge of the nav row, vertically centered alongside the
   * prev/counter/next group (which stays optically centered). Ideal for an
   * info/details toggle that should not cost an extra row of vertical space.
   */
  renderNavStart?: (ctx: ViewerContext) => ReactNode;
  /** Pinned to the RIGHT edge of the nav row; mirror of `renderNavStart`. */
  renderNavEnd?: (ctx: ViewerContext) => ReactNode;
  /** Content below the nav row. */
  renderFooter?: (ctx: ViewerContext) => ReactNode;
  /** Drawers/graphs layered over the image. */
  renderOverlay?: (ctx: ViewerContext) => ReactNode;

  // Theming / a11y
  classNames?: Partial<Record<ViewerSlot, string>>;
  icons?: Partial<ViewerIcons>;
  ariaLabel?: string;
}
