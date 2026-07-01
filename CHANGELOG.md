# Changelog

Each entry mirrors its [GitHub Release](https://github.com/jekrch/react-viewport-lightbox/releases).
See [docs/RELEASING.md](docs/RELEASING.md) for the format.

## v0.3.0

- **`onEscape`** prop — called on Escape before the viewer closes; return `true`
  to mark the key handled and veto the default close (e.g. dismiss your own
  overlay first, closing the viewer only on a second press).
- **`showZoomControls`** prop — toggle the built-in zoom in/out/reset buttons
  independently of the `zoom` gestures, so a consumer overlay can own the chrome
  while zoom/pan stays live. Also auto-hidden while the image is shifted out of
  view via `setContentShift`.
- **`disableNavigation`** prop — suppress built-in arrow-key navigation and the
  swipe commit without tearing the viewer down, e.g. while an overlay does its
  own left/right handling.
- **`navSlotPlacement`** prop (`"edge"` | `"inline"`) — place the
  `renderNavStart` / `renderNavEnd` slots at the row edges (nav group stays
  optically centered) or flanking the arrows as one centered cluster.
- **Nav sizing props** — `navHeight`, `navInset`, and `counterFontSize` size the
  bottom nav controls and counter (number = px, string verbatim), each setting
  the matching `--rvl-nav-height` / `--rvl-nav-inset` / `--rvl-counter-font-size`
  custom property.
- **`closing`** on `ViewerContext` — `true` once the exit animation starts, so
  overlay content can fade out in step with the closing chrome instead of
  vanishing on unmount.
- **Touch-primary detection** — the zoom controls now hide only on touch-primary
  devices via `(hover: none) and (pointer: coarse)` instead of `maxTouchPoints`,
  so touchscreen laptops and mouse-driven 2-in-1s keep them.
- **Body scroll lock** — pin the page with `position: fixed` at its exact scroll
  offset (fixes the visible "skip" when opening while scrolled near the bottom),
  and skip the scrollbar-width padding when the root already reserves space with
  `scrollbar-gutter: stable`.

## v0.2.0

- **Zoom-from-thumbnail** shared-element open/close transition via `getOriginRect`
  (honors reduced-motion).
- **`zoomToCursor`** — anchor wheel/pinch zoom on the pointer (defaults to `true`;
  set `false` to zoom about center).
- **`closeOnBackdropClick`** prop.
- Open/close and slide **animations**.
- Playground showcase enhancements (incl. live code panel).
- Docs/README updates and Prettier formatting fixes.

## v0.1.0

- Initial release: headless interaction hooks (`useImageZoomPan`,
  `useSlideNavigation`, `useGestureHandler`, `useBarMeasure`, `useBodyScrollLock`,
  `useFocusTrap`) plus a batteries-included `<ImageViewer>` shell.
