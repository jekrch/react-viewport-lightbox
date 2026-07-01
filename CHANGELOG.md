# @jekrch/react-viewport-lightbox

## 0.3.0

### Minor changes

- Add `onEscape` prop: called when the user presses Escape before the viewer
  closes. Return `true` to mark the key handled and veto the default close (e.g.
  dismiss a consumer overlay first, closing the viewer only on a second press).
- Add `showZoomControls` prop (default `true`) to toggle the built-in
  zoom in/out/reset buttons independently of the `zoom` gestures — useful while
  a consumer overlay temporarily owns the chrome. The controls are now also
  auto-hidden while the image is shifted out of view via `setContentShift`.
- Add `disableNavigation` prop (default `false`) to suppress built-in arrow-key
  navigation and the swipe commit without tearing the viewer down, e.g. while an
  overlay does its own left/right handling.
- Add `navSlotPlacement` prop (`"edge"` | `"inline"`, default `"edge"`)
  controlling whether the `renderNavStart` / `renderNavEnd` slots pin to the row
  edges (nav group stays optically centered) or flank the arrows as one centered
  cluster.
- Add `navHeight`, `navInset`, and `counterFontSize` props for sizing the bottom
  nav controls and counter. Numbers are treated as pixels; strings pass through
  verbatim. Each sets the corresponding `--rvl-nav-height` / `--rvl-nav-inset` /
  `--rvl-counter-font-size` custom property, so they can equally be themed in CSS.
- Add `closing` to `ViewerContext`: `true` once the exit animation starts (before
  `onClose` fires and the viewer unmounts), so overlay content can fade out in
  step with the closing chrome instead of vanishing on unmount.

### Patch changes

- Zoom controls: detect touch-primary devices with a
  `(hover: none) and (pointer: coarse)` media query instead of `maxTouchPoints`,
  so touchscreen laptops and mouse-driven 2-in-1s no longer wrongly hide the
  zoom buttons.
- Body scroll lock: pin the page with `position: fixed` at its exact scroll
  offset (restored via `scrollTo`) rather than `overflow: hidden` alone, fixing
  the visible "skip" when the lightbox opens while scrolled near the bottom of
  the page. Skip the scrollbar-width padding compensation when the root already
  reserves space with `scrollbar-gutter: stable`, so the page no longer shifts by
  a scrollbar's width.

## 0.2.0

- Nav edge slots (`renderNavStart` / `renderNavEnd`), `onNavigate`, animated
  `setContentShift`, and `renderOverlay` layering fixes.

## 0.1.0

- Initial release: headless interaction hooks (`useImageZoomPan`,
  `useSlideNavigation`, `useGestureHandler`, `useBarMeasure`, `useBodyScrollLock`,
  `useFocusTrap`) plus a batteries-included `<ImageViewer>` shell.
