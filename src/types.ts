import type { ReactNode } from "react";

/**
 * A single image in the viewer. Neutral replacement for app-specific item
 * types (e.g. `Panel` / `Organism`).
 *
 * `TData` is an optional per-slide payload (caption, credit, links, anything).
 * It travels with the item and is surfaced as `ctx.item.data` in every render
 * slot, so details stay paired with their image without a parallel lookup.
 */
export interface ViewerItem<TData = unknown> {
  id: string;
  /** FINAL url — the consumer resolves any base path before passing it in. */
  src: string;
  alt?: string;
  /** Optional thumbnail url; falls back to `src`. */
  thumbnail?: string;
  /** Arbitrary per-slide payload, surfaced as `ctx.item.data` in render slots. */
  data?: TData;
}

/**
 * A rectangle in viewport coordinates. Structurally compatible with the
 * `DOMRect` returned by `element.getBoundingClientRect()`, so you can pass one
 * straight through.
 */
export interface ViewerRect {
  top: number;
  left: number;
  width: number;
  height: number;
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
  | "overlay"
  | "spinner";

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
export interface ViewerContext<TData = unknown> {
  items: ViewerItem<TData>[];
  index: number;
  item: ViewerItem<TData>;
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

export interface ImageViewerProps<TData = unknown> {
  items: ViewerItem<TData>[];
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

  /**
   * Enables a shared-element "zoom from thumbnail" open/close transition. Given
   * the active index, return the on-screen rect of the source element (e.g. the
   * gallery thumbnail) — typically `el.getBoundingClientRect()`. The active
   * image expands from that rect on open and collapses back into it on close.
   * Return `null` for an index with no on-screen source (or omit the prop
   * entirely) to fall back to the default fade. Honors reduced-motion.
   */
  getOriginRect?: (index: number) => ViewerRect | null;

  // Behavior
  /** Enable zoom/pan (wheel, pinch, double-tap). Default `true`. */
  zoom?: boolean;
  /**
   * Anchor wheel- and pinch-zoom on the pointer: scrolling zooms toward the
   * cursor and a pinch zooms toward the gesture midpoint. Set `false` to zoom
   * about the viewport center instead. Default `true`.
   */
  zoomToCursor?: boolean;
  /** Show the `index / total` counter. Default `true`. */
  showCounter?: boolean;
  /** Wrap around at the ends. Default `false`. */
  loop?: boolean;
  /**
   * Close the viewer when the empty area around the image (the backdrop) is
   * clicked. Clicks on the image, the bars, and the control buttons are
   * unaffected. Default `false`.
   */
  closeOnBackdropClick?: boolean;

  // Slots (all receive ViewerContext)
  /** Top-left title area. */
  renderHeader?: (ctx: ViewerContext<TData>) => ReactNode;
  /** Extra top-right buttons, rendered before the close button. */
  renderHeaderActions?: (ctx: ViewerContext<TData>) => ReactNode;
  /**
   * Pinned to the LEFT edge of the nav row, vertically centered alongside the
   * prev/counter/next group (which stays optically centered). Ideal for an
   * info/details toggle that should not cost an extra row of vertical space.
   */
  renderNavStart?: (ctx: ViewerContext<TData>) => ReactNode;
  /** Pinned to the RIGHT edge of the nav row; mirror of `renderNavStart`. */
  renderNavEnd?: (ctx: ViewerContext<TData>) => ReactNode;
  /** Content below the nav row. */
  renderFooter?: (ctx: ViewerContext<TData>) => ReactNode;
  /** Drawers/graphs layered over the image. */
  renderOverlay?: (ctx: ViewerContext<TData>) => ReactNode;

  // Theming / a11y
  classNames?: Partial<Record<ViewerSlot, string>>;
  icons?: Partial<ViewerIcons>;
  ariaLabel?: string;
}
