# Theming

[← README](../../README.md) · [All guides](README.md)

Override any of these CSS custom properties (cascade into the viewer):

| Variable                                   | Default                                |
| ------------------------------------------ | -------------------------------------- |
| `--rvl-accent`                             | `#4c538d`                              |
| `--rvl-overlay-bg`                         | `rgba(0,0,0,0.9)`                      |
| `--rvl-theme-color`                        | `#000000`                              |
| `--rvl-btn-bg` / `--rvl-btn-bg-hover`      | translucent white                      |
| `--rvl-radius`                             | `4px`                                  |
| `--rvl-anim-duration`                      | `250ms`                                |
| `--rvl-backdrop-in` / `--rvl-backdrop-out` | `350ms` / `250ms`                      |
| `--rvl-backdrop-in-ease`                   | `cubic-bezier(0.4, 0, 0.2, 1)`         |
| `--rvl-backdrop-out-ease`                  | `cubic-bezier(0.65, 0.25, 0.95, 0.95)` |
| `--rvl-backdrop-filter`                    | `none`                                 |
| `--rvl-chrome-bleed`                       | `6rem`                                 |
| `--rvl-nav-hit-slop`                       | `0.75rem`                              |

```css
.my-gallery {
  --rvl-accent: #ff5c8a;
  --rvl-overlay-bg: rgba(10, 10, 20, 0.96);
}
```

For the accent alone there's also the `accent` prop (`accent="#ff5c8a"`), which
sets `--rvl-accent` on the viewer itself.

`--rvl-theme-color` tints the iOS Safari chrome (the status-bar strip above and the
home-indicator strip below the viewport) while the viewer is open. It must be opaque
(iOS ignores alpha for chrome color), which is why it's separate from
`--rvl-overlay-bg`; set it to match a themed overlay. Safari 26 dropped
`<meta name="theme-color">`, so the viewer renders fixed opaque edge strips in this
color for Safari to sample, and still writes the legacy meta tag for iOS 15–18.

The backdrop fades on its own clock (`--rvl-backdrop-in`/`-out`), a little slower
than the zoom and chrome (`--rvl-anim-duration`), and the close waits for it.
`--rvl-backdrop-filter` (e.g. `blur(4px)`) filters the page showing through the
backdrop; it's off by default and always off on touch devices.

`--rvl-chrome-bleed` sets how far the backdrop overdraws past the viewport edges so a
scrolled-open overlay never reveals the page behind those iOS chrome bands; the
default (`6rem`) suits full-height overlays and rarely needs changing.

For finer control, pass `classNames` to target individual slots (`root`, `backdrop`,
`topBar`, `header`, `headerMeta`, `bottomBar`, `image`, `button`, `counter`,
`navButton`, `navStart`, `navEnd`, `overlay`, `hint`, `spinner`, `error`, `imageOverlay`). `.rvl-hint` is also safe to reuse in your own footer
for a line that matches the built-in hint.
