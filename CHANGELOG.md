# Changelog

Each entry mirrors its [GitHub Release](https://github.com/jekrch/react-viewport-lightbox/releases).
See [docs/RELEASING.md](docs/RELEASING.md) for the format.

## v0.5.0

- **`getOriginRect` → `getOrigin`** (breaking) — the shared-element zoom callback
  now returns the source **element** (typically your ref) instead of a
  pre-computed rect. The viewer reads the rect for you, and reads the thumbnail's
  corner radius too, so the image's corners now morph to match the thumbnail
  across the flight instead of snapping into shape at the end. Returning a bare
  `ViewerRect` is still supported (falls back to the image's own corner radius).
- **Neighbor preloading** — on every index change the viewer background-fetches
  the previous and next images, so a button/keyboard move or a fresh swipe draws
  the neighbor from the browser cache instead of hitting the network cold on its
  first frame. Fetches are dropped on navigation; any that complete stay cached.
- **iOS chrome tinting** — while open, the viewer overrides the document's
  `<meta name="theme-color">` so iOS Safari tints its status-bar and
  home-indicator bands to match the overlay instead of sampling the page behind
  it, and restores the previous tag on close. Themeable via the new
  `--rvl-theme-color` custom property (opaque; default `#000000`).
- **Smoother iOS close** — the backdrop now fades via `opacity` on a composited
  layer rather than animating `background-color`/`backdrop-filter`. Fixes the
  bottom safe-area band holding its color through the close and snapping off at
  unmount, and the blur stepping/flickering while the thumbnail-zoom collapse
  composites at the same time. The collapse also now targets the thumbnail's
  settled rect, so releasing the scroll lock mid-close no longer misaims it.
- **Slide re-measure on load** — a letterboxed neighbor that finishes loading
  mid-swipe is repositioned to emerge from the screen edge instead of poking into
  the margin.

## v0.4.0

- **Off-image swipe fix** — swipe and pan gestures now register across the whole
  stage instead of only the image box, so a swipe begun in the empty (letterbox)
  space around a differently-sized image navigates as expected rather than being
  read as a backdrop tap that closes the viewer. Backdrop tap-to-close still
  fires only for a stationary tap, never a swipe that happens to end over empty
  space.
- **Image-relative slide transition** — the swipe/commit slide now travels by the
  image width plus its near margin instead of a full viewport width, so a
  neighbor starts entering from the screen edge and both images move together
  at the same speed. Fixes the incoming image visibly lagging then rushing to
  center on letterboxed images (worst in landscape), and the far-edge blink of
  the outgoing image as a slide settled.
- **Smoother scroll-zoom** — each wheel tick now glides into the next with a
  short transition instead of snapping, so continuous scrolling reads as smooth
  zoom rather than discrete steps.
- **Pinch-to-pan** — sliding both fingers across the screen during a pinch now
  repositions the image, on top of the pinch scaling about the midpoint.
- **Overlay fade on close** — `renderOverlay` content now fades out in step with
  the rest of the chrome on close instead of popping out of existence the instant
  the viewer unmounts.
- **Reduced iOS flicker** — compositing-layer hints are now applied only while a
  zoom or swipe is actually in flight and released the moment it settles, instead
  of permanently pinning full-size image layers for the viewer's whole life,
  which iOS could flicker.

## v0.3.1

- **iOS ghost click/dblclick fix** — a tap that opens the viewer no longer lets
  Safari's late synthesized `click`/`dblclick` re-target onto the freshly
  mounted viewer, which previously closed it instantly or zoomed the image on
  open. Synthesized mouse events within 700ms of open are now ignored.
- **iOS tap-fallthrough fix** — closing the viewer with a backdrop/stage tap now
  happens on `touchend` with `preventDefault`, so the synthesized events don't
  fall through to a thumbnail on the page behind and leave it stuck in `:hover`.
- **iOS text-size fix** — set `-webkit-text-size-adjust: 100%` on the root so
  Safari stops auto-inflating text on rotation to landscape (and failing to
  restore it on rotation back to portrait).

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
