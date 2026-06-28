---
"@jekrch/react-viewport-lightbox": minor
---

Add `renderNavStart` / `renderNavEnd` slots that pin content (e.g. a details
toggle) to the edges of the nav row while keeping the prev/counter/next group
optically centered — so an info toggle costs no extra vertical space. Also adds
`navStart` / `navEnd` to `classNames` and an `.rvl-btn.is-active` style for
toggle buttons.

Add an `onNavigate(direction)` prop that fires when a slide **starts** (button,
key, or swipe), before the resulting `onIndexChange`, so overlays such as an info
drawer can animate out in sync with the image instead of after it.

`ViewerContext.setContentShift` now takes an optional second arg `animate`
(default `true`); pass `false` to apply the shift with no transition — e.g. to
snap the image back to center on navigation so it slides in horizontally instead
of dropping down. The playground demos the plantyJ-style inline-left Details
button with a full-height drawer that slides up when toggled and out sideways when
navigating, while the next image slides straight in.
