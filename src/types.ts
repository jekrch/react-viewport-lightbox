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
  /**
   * Optional responsive candidates, forwarded to the underlying `<img srcset>`
   * (and mirrored into the neighbor preloads, so warming fetches the same
   * resource the panel will render). Lets phones fetch and decode an
   * appropriately sized image instead of the full-resolution `src` — usually
   * the single biggest mobile cost. `src` remains the fallback.
   */
  srcSet?: string;
  /** `sizes` for the `srcSet` candidates, forwarded to `<img sizes>`. */
  sizes?: string;
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

  /**
   * True once the exit animation has started (after a close was requested,
   * before `onClose` fires and the viewer unmounts). Lets overlay content fade
   * out in step with the closing chrome instead of vanishing on unmount.
   */
  closing: boolean;

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
   * Called when the user presses Escape, before the viewer closes. Return
   * `true` to mark the key handled and veto the default close — e.g. to dismiss
   * a consumer overlay (drawer/graph) first, closing the viewer only on a
   * second press. Return `false`/`undefined` to fall through to the default
   * close.
   */
  onEscape?: () => boolean;

  /**
   * Enables a shared-element "zoom from thumbnail" open/close transition. Given
   * the active index, return the source element (e.g. the gallery thumbnail) —
   * typically just your ref for that index. The active image expands out of it
   * on open and collapses back into it on close, matching its corner radius so
   * the rounding never snaps. Return `null` for an index with no on-screen
   * source (or omit the prop entirely) to fall back to the default fade.
   *
   * You may also return a bare {@link ViewerRect} (e.g. a computed
   * `getBoundingClientRect()`) when you have no element to hand over; the
   * transition still plays, using the image's own corner radius. Honors
   * reduced-motion.
   */
  getOrigin?: (index: number) => HTMLElement | ViewerRect | null;

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
  /**
   * Show the built-in zoom in/out/reset buttons in the top bar. Independent of
   * `zoom` (which governs the gesture behavior): set this `false` to keep
   * zoom/pan gestures while a consumer overlay (e.g. an open graph/drawer that
   * covers the image) temporarily owns the chrome. Default `true`.
   */
  showZoomControls?: boolean;
  /**
   * Suppress built-in arrow-key navigation (and the swipe commit) without
   * tearing the viewer down. Useful while an overlay that has its own
   * left/right handling is open. Does not hide the on-screen nav buttons.
   * Default `false`.
   */
  disableNavigation?: boolean;
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
  /**
   * Where the `renderNavStart` / `renderNavEnd` slots sit relative to the
   * prev/counter/next group:
   * - `"edge"` (default): pinned to the left/right edges of the nav row (max
   *   42rem), keeping the nav group optically centered regardless of slot width.
   * - `"inline"`: placed directly flanking the nav group as one centered
   *   cluster, so a details/info toggle hugs the arrows.
   */
  navSlotPlacement?: "edge" | "inline";
  /**
   * Size of the prev/next nav arrows (the bottom nav controls). A number is
   * treated as pixels; a string is used verbatim (e.g. `"1.5rem"`). Sets the
   * `--rvl-nav-height` custom property, so it can equally be themed in CSS.
   * Defaults to `2.375rem` (38px) to match the comic-snaps viewer.
   */
  navHeight?: number | string;
  /**
   * Gap between the bottom nav controls and the viewport's bottom edge. A number
   * is treated as pixels; a string is used verbatim (e.g. `"2rem"`). Sets the
   * `--rvl-nav-inset` custom property and is floored by the device safe-area
   * inset. Defaults to `1.3rem`.
   */
  navInset?: number | string;
  /**
   * Counter font size. By default the counter scales with `navHeight` (≈0.29×);
   * set this to override that ratio with a fixed size. A number is treated as
   * pixels; a string is used verbatim. Sets `--rvl-counter-font-size`.
   */
  counterFontSize?: number | string;
  /** Content below the nav row. */
  renderFooter?: (ctx: ViewerContext<TData>) => ReactNode;
  /** Drawers/graphs layered over the image. */
  renderOverlay?: (ctx: ViewerContext<TData>) => ReactNode;

  // Theming / a11y
  classNames?: Partial<Record<ViewerSlot, string>>;
  icons?: Partial<ViewerIcons>;
  ariaLabel?: string;
}
