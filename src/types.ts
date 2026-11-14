import type { ReactNode } from "react";

/** The fields every {@link ViewerItem} has, whatever its `data`. */
export interface ViewerItemBase {
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
  /**
   * A full-resolution url to show once the user zooms in (past 1.5×), fetched
   * only then. Without it, a zoom picks a bigger `srcSet` candidate if there
   * is one. Either way the swap happens after the new image has decoded.
   */
  zoomSrc?: string;
  alt?: string;
  /**
   * Optional low-resolution url for this image (e.g. the gallery tile's
   * source). When the viewer opens on this item it is shown straight away,
   * scaled up to the image's resting size, and swapped for `src` once the full
   * image has decoded, so the open never waits on the network. Ignored when it
   * is the same url as `src`. With `getOrigin`, an already-loaded `<img>`
   * inside the origin element is used the same way, with no need to set this.
   */
  thumbnail?: string;
  /**
   * Reserved for slide types other than images (video, say) in a later
   * version. Leave it unset: a missing `kind` means `"image"`.
   */
  kind?: "image";
}

/**
 * A single image in the viewer.
 *
 * `TData` types a per-slide payload (caption, credit, links, anything) on
 * `data`. It travels with the item and is surfaced as `ctx.item.data` in every
 * render slot, so details stay paired with their image without a parallel
 * lookup. Name a `TData` and `data` is required (so `ctx.item.data` needs no
 * `!`); leave it out, or include `undefined` in it, and `data` is optional.
 */
export type ViewerItem<TData = unknown> = ViewerItemBase &
  (undefined extends TData
    ? {
        /** Per-slide payload, surfaced as `ctx.item.data` in render slots. */
        data?: TData;
      }
    : {
        /** Per-slide payload, surfaced as `ctx.item.data` in render slots. */
        data: TData;
      });

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
  | "header"
  | "headerMeta"
  | "bottomBar"
  | "image"
  | "button"
  | "counter"
  | "navButton"
  | "navStart"
  | "navEnd"
  | "overlay"
  | "hint"
  | "spinner"
  | "error"
  | "imageOverlay";

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
  /**
   * Jump to any item. It plays like a step: `onNavigate` fires with the
   * direction it lies in, then the image slides out and the target slides in
   * (an instant cut under reduced motion). Drops any zoom first.
   */
  goTo: (index: number) => void;
  /**
   * Start the animated close. `then` runs once the viewer has stepped back off
   * its `history` entry (at once without one); navigate from there rather
   * than right after `close()`, or the viewer's entry is left on the stack
   * behind your new URL and back needs an extra press. It runs as the close
   * begins, not after the exit animation (that's `onClose`).
   */
  close: (then?: () => void) => void;

  isZoomed: boolean;
  displayScale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  isTouchDevice: boolean;

  /** True while {@link ImageViewerProps.tapToToggleChrome} has hidden the bars. */
  chromeHidden: boolean;

  /**
   * Measured bar heights so overlays (info drawers) can size themselves
   * between the bars.
   */
  topBarHeight: number;
  bottomBarHeight: number;
}

/**
 * Where the image stage sits. `"up"` / `"down"` push it a full viewport out of
 * view (to reveal a drawer below or above it); any other string is used
 * verbatim as a CSS transform; `null` keeps it centered.
 */
export type ViewerStageShift = "up" | "down" | (string & {}) | null;

/** Options for {@link ImageViewerProps.history}. */
export interface ViewerHistoryOptions<TData = unknown> {
  /**
   * Query parameter that names the open item, e.g. `"photo"` for
   * `?photo=<id>`. Written into the viewer's history entry and kept current as
   * the user navigates. Omit to leave the URL alone.
   */
  param?: string;
  /**
   * The parameter's value for an item. Defaults to `item.id`. Return `null` to
   * leave the parameter off for an item that has no linkable value.
   */
  value?: (item: ViewerItem<TData>) => string | null;
  /**
   * How paging between items updates history. `"replace"` (default) keeps one
   * entry, updated in place, so a single back press closes the viewer however
   * far the user paged. `"push"` adds an entry per item, so back steps through
   * the viewed items and closes from the one the viewer opened on (forward
   * steps ahead again); closing from the UI still returns to the page in one go.
   */
  paging?: "replace" | "push";
}

export interface ImageViewerProps<TData = unknown> {
  items: ViewerItem<TData>[];
  /** Controlled index of the active item. */
  index: number;
  onIndexChange: (index: number) => void;
  /**
   * Fired when a slide STARTS (button, key, swipe, or `ctx.goTo`), before the
   * animation and the resulting `onIndexChange`. Lets overlays (e.g. an info drawer) animate
   * out in sync with the image. `direction` is the swipe direction.
   */
  onNavigate?: (direction: "prev" | "next") => void;
  /** Called AFTER the exit animation completes. */
  onClose: () => void;
  /**
   * Called synchronously the moment a close begins (button, Escape, backdrop,
   * back button, or `ctx.close`), before the exit animation, and before the
   * thumbnail collapse measures its target. State updates made here commit in
   * the same frame as the close, so a page you paused while the viewer was
   * open can come back under the still-opaque backdrop. Fires once per viewer.
   */
  onCloseStart?: () => void;
  /**
   * Called once the open has settled: when the zoom from the thumbnail lands
   * (see {@link getOrigin}), or when the fade-in finishes without one. Handy
   * for analytics, or for moving focus into an overlay. Not called for a
   * viewer that closes before then. Fires once per viewer.
   */
  onOpenComplete?: () => void;
  /**
   * Called when the user presses Escape, before the viewer closes. Return
   * `true` to mark the key handled and veto the default close — e.g. to dismiss
   * a consumer overlay (drawer/graph) first, closing the viewer only on a
   * second press. Return `false`/`undefined` to fall through to the default
   * close.
   */
  onEscape?: () => boolean;

  /**
   * Give the open viewer its own browser-history entry, so the back button or
   * back gesture closes it rather than leaving the page. `true` pushes a
   * bare entry; pass `{ param }` to also name the open item in the URL (a
   * shareable deep link), kept current as the user pages. A back press runs
   * through {@link onEscape} first, so a consumer overlay can claim it the same
   * way it claims Escape. Default off.
   *
   * While this is on, don't write the same parameter yourself, and preserve
   * `history.state` in any `replaceState` you make while the viewer is open:
   * the entry is recognized by a key in that state.
   */
  history?: boolean | ViewerHistoryOptions<TData>;

  /**
   * Push the image stage out of view to make room for an overlay, e.g.
   * `stageShift={drawerOpen ? "up" : null}`. Changes animate, with two
   * exceptions that snap: a viewer that mounts already shifted starts in
   * place, and a shift cleared as a slide starts (closing the drawer from
   * `onNavigate`) returns to center at once, so the next image slides in
   * level. While shifted, the zoom controls hide and a close fades instead of
   * collapsing into the thumbnail.
   */
  stageShift?: ViewerStageShift;

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
   *
   * A source element that CROPS its image — an `object-fit: cover` thumbnail,
   * the usual shape of a gallery tile — is handled for you. The flight targets
   * the rect the whole image would occupy at the crop's own scale, so it never
   * squashes on the way, and the parts the thumbnail has no room for fade in
   * and out across the flight instead of appearing and vanishing in one frame
   * at the hand-off. `object-position` is honored. See {@link thumbnailCrop} to
   * turn this off.
   *
   * The item is passed alongside its index. For tiles that carry the item's id
   * in a data attribute, `getOrigin={originFromAttribute("data-photo-id")}`
   * does the lookup.
   */
  getOrigin?: (index: number, item: ViewerItem<TData>) => HTMLElement | ViewerRect | null;

  /**
   * Honor a `getOrigin` element's `object-fit: cover` crop, per the note on
   * {@link getOrigin}. Default `true`. Set `false` to treat every source
   * element's own box as the flight's target, cropped or not — the behavior
   * before 0.9.
   */
  thumbnailCrop?: boolean;

  // Behavior
  /** Enable zoom/pan (wheel, pinch, double-tap). Default `true`. */
  zoom?: boolean;
  /**
   * Anchor wheel- and pinch-zoom on the pointer: scrolling zooms toward the
   * cursor and a pinch zooms toward the gesture midpoint. Set `false` to zoom
   * about the viewport center instead. Default `true`.
   */
  zoomToCursor?: boolean;
  /**
   * What the mouse wheel and trackpad scroll do.
   * - `"pan"` (default): a trackpad pinch or Ctrl+wheel zooms; a plain wheel
   *   or two-finger scroll pans a zoomed image and is left to the browser
   *   otherwise, so a trackpad's two-finger swipe-back still works.
   * - `"zoom"`: every wheel event zooms (the behavior before 1.0). Suits
   *   mouse-wheel audiences; a trackpad scroll then zooms too.
   */
  wheel?: "pan" | "zoom";
  /**
   * A single tap or click on the image hides the bars, and another brings them
   * back, for an unobstructed view. It waits out the double-tap window first,
   * so double-tap zoom still works. `ctx.chromeHidden` reports the state.
   * Default `false`.
   */
  tapToToggleChrome?: boolean;
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
   * unaffected. Suspended while the stage is shifted
   * ({@link ImageViewerProps.stageShift}), since the backdrop is then under an
   * overlay rather than around the image. Default `false`.
   */
  closeOnBackdropClick?: boolean;
  /**
   * Drag the image up or down to close. The image follows the drag and shrinks
   * while the backdrop and bars fade; released far enough (or flicked), the
   * viewer closes, collapsing into the thumbnail when `getOrigin` supplies one.
   * Works with touch and mouse, only while the image isn't zoomed (a drag then
   * pans), and is suspended while the stage is shifted. Default `true`.
   */
  swipeToClose?: boolean;
  /**
   * How many images on each side of the active one to fetch and decode in the
   * background, so navigating to them doesn't wait on the network. Follows
   * `loop`. Default `1`, or `0` when the browser reports Save-Data; an explicit
   * value always wins.
   */
  preloadCount?: number;

  // Slots (all receive ViewerContext)
  /** Top-left title area. */
  renderHeader?: (ctx: ViewerContext<TData>) => ReactNode;
  /** Extra top-right buttons, rendered before the close button. */
  renderHeaderActions?: (ctx: ViewerContext<TData>) => ReactNode;
  /**
   * A small line under the top-right buttons, right-aligned (a byline, a
   * date). Takes part in the bar's layout, so `ctx.topBarHeight` includes it.
   * Styled by `.rvl-header-meta`; target it with `classNames.headerMeta`.
   */
  renderHeaderMeta?: (ctx: ViewerContext<TData>) => ReactNode;
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
  /**
   * A muted gesture-hint line at the very bottom, below {@link renderFooter}.
   * `true` shows built-in text that names only what works right now: touch vs.
   * desktop gestures, navigation only with more than one item (and not under
   * `disableNavigation`), zoom only when `zoom` is on, `esc` on desktop. A
   * function supplies your own text instead (e.g. for i18n); return `null` to
   * hide it. Either way the line hides while zoomed or while the stage is
   * shifted. Styled by `.rvl-hint`; target it with `classNames.hint`.
   * Default `false`.
   */
  hint?: boolean | ((ctx: ViewerContext<TData>) => ReactNode);
  /** Drawers/graphs layered over the image. */
  renderOverlay?: (ctx: ViewerContext<TData>) => ReactNode;
  /**
   * Content rendered INSIDE the image wrapper, pinned to the active image's own
   * box rather than the whole stage — so an absolutely-positioned child (a
   * "removed"/"NSFW" badge, a watermark, a corner caption) tracks the corners of
   * the letterboxed image as it resizes, instead of floating in the surrounding
   * dead space the way {@link renderOverlay} would. The wrapper is
   * `position: relative; overflow: hidden`; position children against it.
   * Non-interactive by default (the wrapper owns the image tap); set
   * `pointer-events: auto` on a child that needs clicks. The content fades in
   * with the bars as the viewer opens, out as soon as a close begins, and
   * quickly on each new slide (it remounts per slide); gate on `ctx.isZoomed`
   * yourself if it should also hide while zoomed.
   */
  renderImageOverlay?: (ctx: ViewerContext<TData>) => ReactNode;
  /**
   * What to show, centered on the stage, when the active image fails to load.
   * `retry` reloads it. Default: "Couldn't load image" and a Retry button.
   * Return `null` to show nothing. Rendered inside `.rvl-error` (role `alert`;
   * target it with `classNames.error`), which keeps taps from reaching the
   * backdrop. Zoom is off while the error shows.
   */
  renderError?: (ctx: ViewerContext<TData>, retry: () => void) => ReactNode;

  // Theming / a11y
  /**
   * Accent color (any CSS color) for the viewer's active and focus states.
   * Sets `--rvl-accent` on the viewer, so it wins over one set on an ancestor.
   */
  accent?: string;
  classNames?: Partial<Record<ViewerSlot, string>>;
  icons?: Partial<ViewerIcons>;
  ariaLabel?: string;
}
