# @jekrch/react-viewport-lightbox

[![npm version](https://img.shields.io/npm/v/@jekrch/react-viewport-lightbox.svg?color=blue)](https://www.npmjs.com/package/@jekrch/react-viewport-lightbox)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@jekrch/react-viewport-lightbox)](https://bundlephobia.com/package/@jekrch/react-viewport-lightbox)
[![coverage](https://codecov.io/gh/jekrch/react-viewport-lightbox/branch/main/graph/badge.svg)](https://codecov.io/gh/jekrch/react-viewport-lightbox)
[![types](https://img.shields.io/npm/types/@jekrch/react-viewport-lightbox.svg)](https://www.npmjs.com/package/@jekrch/react-viewport-lightbox)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A touch-friendly React image viewer and lightbox with zoom, pan, pinch, and swipe.
It ships an `<ImageViewer>` shell with render slots for headers, footers, and
overlays (info drawers, graphs, and so on), and the interaction hooks are exported
if you'd rather build your own shell.

**[Live demo →](https://jekrch.github.io/react-viewport-lightbox/)**

- **Zero runtime dependencies.** React is a peer dependency; no Tailwind or icon
  library required.
- **Touch and desktop.** Wheel/pinch zoom, drag/swipe navigation, double-tap and
  double-click, keyboard arrows, rubber-band edges.
- **Themeable** via CSS custom properties and per-slot `className` overrides.
- **Accessible.** `role="dialog"` with focus trap and focus restore, labelled
  controls, honors `prefers-reduced-motion`.
- **Headless.** The interaction hooks are exported for fully custom shells.

## Install

```sh
npm add @jekrch/react-viewport-lightbox
# or: bun add @jekrch/react-viewport-lightbox
```

Import the stylesheet once, anywhere in your app:

```ts
import "@jekrch/react-viewport-lightbox/styles.css";
```

## Quick start

```tsx
import { useState } from "react";
import { ImageViewer, type ViewerItem } from "@jekrch/react-viewport-lightbox";
import "@jekrch/react-viewport-lightbox/styles.css";

const items: ViewerItem[] = [
  { id: "1", src: "/photos/1.jpg", alt: "First" },
  { id: "2", src: "/photos/2.jpg", alt: "Second" },
];

export function Gallery() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <ImageViewer
          items={items}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

Mount the viewer when open and unmount it on close. It runs its own enter/exit
animation and calls `onClose` after the exit completes.

> **Image URLs are passed verbatim.** Resolve any base path (e.g.
> `import.meta.env.BASE_URL`) before putting it in `item.src`.

## Props

| Prop                   | Type                                                   | Default    | Description                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`                | `ViewerItem[]`                                         | required   | Images to display.                                                                                                                                                                                                                                                          |
| `index`                | `number`                                               | required   | Controlled index of the active item.                                                                                                                                                                                                                                        |
| `onIndexChange`        | `(index: number) => void`                              | required   | Called when navigation changes the index.                                                                                                                                                                                                                                   |
| `onNavigate`           | `(direction: "prev" \| "next") => void`                | optional   | Fired when a slide starts (before `onIndexChange`), so overlays can animate out in sync with the image.                                                                                                                                                                     |
| `onClose`              | `() => void`                                           | required   | Called after the exit animation completes.                                                                                                                                                                                                                                  |
| `onEscape`             | `() => boolean`                                        | optional   | Called on Escape before the viewer closes. Return `true` to mark the key handled and veto the default close (e.g. dismiss your own overlay first); `false`/`undefined` falls through to closing.                                                                            |
| `getOrigin`            | `(index: number) => HTMLElement \| ViewerRect \| null` | optional   | Enables a shared-element "zoom from thumbnail" open/close transition. Return the source element (typically your ref) for the given index — its rect and corner radius are read for you — or a bare `ViewerRect`, or `null` to fall back to the fade. Honors reduced-motion. |
| `zoom`                 | `boolean`                                              | `true`     | Enable wheel/pinch/double-tap zoom + pan.                                                                                                                                                                                                                                   |
| `zoomToCursor`         | `boolean`                                              | `true`     | Anchor wheel/pinch zoom on the pointer: scrolling zooms toward the cursor and a pinch zooms toward the gesture midpoint. Set `false` to zoom about the viewport center.                                                                                                     |
| `showCounter`          | `boolean`                                              | `true`     | Show the `index / total` counter.                                                                                                                                                                                                                                           |
| `showZoomControls`     | `boolean`                                              | `true`     | Show the built-in zoom in/out/reset buttons. Independent of `zoom` (the gestures): set `false` to keep zoom/pan while a consumer overlay owns the chrome. Auto-hidden on touch-primary devices and while content is shifted.                                                |
| `disableNavigation`    | `boolean`                                              | `false`    | Suppress built-in arrow-key navigation and swipe commit without tearing the viewer down (e.g. while an overlay handles left/right itself). Does not hide the on-screen nav buttons.                                                                                         |
| `loop`                 | `boolean`                                              | `false`    | Wrap around at the ends (buttons + arrow keys).                                                                                                                                                                                                                             |
| `closeOnBackdropClick` | `boolean`                                              | `false`    | Close the viewer when the empty area around the image is clicked. Image, bars, and controls are unaffected.                                                                                                                                                                 |
| `renderHeader`         | `(ctx) => ReactNode`                                   | optional   | Top-left title area.                                                                                                                                                                                                                                                        |
| `renderHeaderActions`  | `(ctx) => ReactNode`                                   | optional   | Extra top-right buttons (before Close).                                                                                                                                                                                                                                     |
| `renderNavStart`       | `(ctx) => ReactNode`                                   | optional   | Pinned to the left edge of the nav row (e.g. a details toggle); costs no extra height, nav group stays centered.                                                                                                                                                            |
| `renderNavEnd`         | `(ctx) => ReactNode`                                   | optional   | Pinned to the right edge of the nav row.                                                                                                                                                                                                                                    |
| `navSlotPlacement`     | `"edge" \| "inline"`                                   | `"edge"`   | Where `renderNavStart`/`renderNavEnd` sit: `"edge"` pins them to the row edges (nav group stays optically centered); `"inline"` places them directly flanking the arrows as one centered cluster.                                                                           |
| `navHeight`            | `number \| string`                                     | `2.375rem` | Size of the prev/next nav arrows. A number is pixels; a string is used verbatim. Sets `--rvl-nav-height`, so it can also be themed in CSS.                                                                                                                                  |
| `navInset`             | `number \| string`                                     | `1.3rem`   | Gap between the bottom nav controls and the viewport's bottom edge (floored by the safe-area inset). Number is pixels; string verbatim. Sets `--rvl-nav-inset`.                                                                                                             |
| `counterFontSize`      | `number \| string`                                     | `0.29×`    | Overrides the counter font size (which otherwise scales with `navHeight`). Number is pixels; string verbatim. Sets `--rvl-counter-font-size`.                                                                                                                               |
| `renderFooter`         | `(ctx) => ReactNode`                                   | optional   | Content below the nav row.                                                                                                                                                                                                                                                  |
| `renderOverlay`        | `(ctx) => ReactNode`                                   | optional   | Drawers and graphs layered over the image.                                                                                                                                                                                                                                  |
| `classNames`           | `Partial<Record<ViewerSlot, string>>`                  | optional   | Per-slot `className` overrides.                                                                                                                                                                                                                                             |
| `icons`                | `Partial<ViewerIcons>`                                 | optional   | Override `close`, `zoomIn`, `zoomOut`, `prev`, and `next`.                                                                                                                                                                                                                  |
| `ariaLabel`            | `string`                                               | item `alt` | Dialog label.                                                                                                                                                                                                                                                               |

### `ViewerItem`

```ts
interface ViewerItem<TData = unknown> {
  id: string;
  src: string; // final url
  alt?: string;
  thumbnail?: string; // falls back to src
  data?: TData; // optional per-slide payload (see below)
}
```

### Per-slide details

Anything richer than `alt` (a caption, credit line, tags, links) can live on the
item itself via the optional `data` field, instead of keeping a parallel array or
`id → details` map in sync as the index changes. Type it once and the viewer
passes it to every slot as `ctx.item.data`:

```tsx
interface Detail {
  title: string;
  body: string;
}

const items: ViewerItem<Detail>[] = [
  {
    id: "1",
    src: "/photos/1.jpg",
    alt: "First",
    data: { title: "Sunrise", body: "Shot at dawn." },
  },
  { id: "2", src: "/photos/2.jpg", alt: "Second", data: { title: "Dusk", body: "Golden hour." } },
];

<ImageViewer
  items={items} // TData is inferred, no annotation needed at the call site
  index={index}
  onIndexChange={setIndex}
  onClose={() => setOpen(false)}
  renderOverlay={(ctx) => (
    // ctx.item.data is typed as Detail | undefined, and always matches the
    // current slide, and updates as you navigate.
    <div className="my-details">
      <h2>{ctx.item.data?.title}</h2>
      <p>{ctx.item.data?.body}</p>
    </div>
  )}
/>;
```

`ViewerItem`, `ViewerContext`, and `ImageViewerProps` are all generic over `TData`
(defaulting to `unknown`), so this is fully type-safe and entirely opt-in.

### Zoom from thumbnail

Pass `getOrigin` to make the viewer expand out of the clicked thumbnail on open
and collapse back into it on close (a shared-element transition), instead of the
default fade. Keep a ref to each thumbnail and return the element for the given
index; return `null` (or omit the prop) to fall back to the fade. It's called again
with the active index on close, so navigating then closing collapses into the right
thumbnail, and it honors `prefers-reduced-motion`.

```tsx
const thumbs = useRef<(HTMLElement | null)[]>([]);

{
  items.map((it, i) => (
    <button key={it.id} ref={(el) => (thumbs.current[i] = el)} onClick={() => open(i)}>
      <img src={it.thumbnail ?? it.src} alt={it.alt} />
    </button>
  ));
}

<ImageViewer
  items={items}
  index={index}
  onIndexChange={setIndex}
  onClose={() => setOpen(false)}
  getOrigin={(i) => thumbs.current[i]}
/>;
```

Handing over the element lets the viewer read its rect **and** its corner radius,
so the image's corners morph to match the thumbnail's — the rounding never snaps.
If you have no element to give (e.g. a virtualized or computed position), return a
bare `ViewerRect` instead; the transition still plays, falling back to the image's
own corner radius (`--rvl-radius`).

The transition reads most seamlessly when the thumbnail and full image share an
aspect ratio (the thumbnail is, after all, the same picture).

## Slots & `ViewerContext`

Every `render*` slot receives a `ViewerContext` with navigation, zoom, and layout
state so slot content can coordinate with the viewer:

```ts
interface ViewerContext<TData = unknown> {
  items: ViewerItem<TData>[];
  index: number;
  item: ViewerItem<TData>; // item.data holds your per-slide payload
  total: number;
  closing: boolean; // true once the exit animation starts, so overlays can fade out in step

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

  // Measured bar heights so overlays can size between the bars.
  topBarHeight: number;
  bottomBarHeight: number;

  // Push the image track up/down (e.g. when a drawer opens). null resets.
  // animate defaults to true; pass false to apply instantly (no transition).
  setContentShift: (transform: string | null, animate?: boolean) => void;
}
```

Here's a Details toggle pinned left of the nav controls. Opening it slides the
image up (`setContentShift`) and the drawer up into its place. Navigating while it
is open slides the drawer out sideways and snaps the image back to center with
`setContentShift(null, false)` (no animation), so the next image slides straight in
horizontally instead of dropping from the top. Keep the drawer mounted so it
animates its own `transform`:

```tsx
const [drawer, setDrawer] = useState(false);
const [slideDir, setSlideDir] = useState<"prev" | "next" | null>(null);
const shiftRef = useRef<ViewerContext["setContentShift"] | null>(null);

// After the slide lands, re-park the drawer at the bottom without animating
// (both positions are off-screen, so it snaps invisibly).
const [instant, setInstant] = useState(false);
useEffect(() => {
  if (slideDir) {
    setInstant(true);
    setSlideDir(null);
  }
}, [index]);
useEffect(() => {
  if (!instant) return;
  const r = requestAnimationFrame(() => setInstant(false));
  return () => cancelAnimationFrame(r);
}, [instant]);

const transform = slideDir
  ? `translateX(${slideDir === "next" ? "-100%" : "100%"})`
  : drawer
    ? "translateY(0)"
    : "translateY(100vh)";

<ImageViewer
  items={items}
  index={index}
  onIndexChange={setIndex}
  onNavigate={(dir) => {
    if (drawer) {
      setSlideDir(dir);
      setDrawer(false);
      shiftRef.current?.(null, false); // snap image to center, no animation
    }
  }}
  onClose={() => setOpen(false)}
  renderNavStart={(ctx) => (
    <button
      className={`rvl-btn${drawer ? " is-active" : ""}`}
      onClick={() => {
        const next = !drawer;
        setSlideDir(null);
        setDrawer(next);
        ctx.setContentShift(next ? "translateY(-100vh)" : null);
      }}
    >
      {drawer ? "Hide details" : "Details"}
    </button>
  )}
  renderOverlay={(ctx) => {
    shiftRef.current = ctx.setContentShift;
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: ctx.topBarHeight, // size between the measured bars
          bottom: ctx.bottomBarHeight,
          // opaque, but pixel-identical to the area behind the image
          background: `linear-gradient(var(--rvl-overlay-bg), var(--rvl-overlay-bg)), ${PAGE_BG}`,
          transform,
          transition: instant ? "none" : "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)",
          pointerEvents: drawer ? "auto" : "none",
        }}
      >
        <MyDrawerContents item={ctx.item} />
      </div>
    );
  }}
/>;
```

`renderNavStart` keeps the prev/counter/next group optically centered, so the
toggle adds no vertical space. This is the layout the plantyJ viewer uses. The image
snap on `onNavigate` is hidden because the opaque drawer is still covering it at that
instant. For a partial peek drawer, use a smaller animated shift like
`translateY(-40vh)` and skip the snap.

## Theming

Override any of these CSS custom properties (cascade into the viewer):

| Variable                              | Default           |
| ------------------------------------- | ----------------- |
| `--rvl-accent`                        | `#4c538d`         |
| `--rvl-overlay-bg`                    | `rgba(0,0,0,0.9)` |
| `--rvl-theme-color`                   | `#000000`         |
| `--rvl-btn-bg` / `--rvl-btn-bg-hover` | translucent white |
| `--rvl-radius`                        | `4px`             |
| `--rvl-anim-duration`                 | `250ms`           |

```css
.my-gallery {
  --rvl-accent: #ff5c8a;
  --rvl-overlay-bg: rgba(10, 10, 20, 0.96);
}
```

`--rvl-theme-color` tints the iOS Safari chrome (the status-bar strip above and the
home-indicator strip below the viewport) while the viewer is open, via a
`<meta name="theme-color">` override that's restored on close. It must be opaque
(`theme-color` ignores alpha), which is why it's separate from `--rvl-overlay-bg`;
set it to match a themed overlay.

For finer control, pass `classNames` to target individual slots (`root`, `backdrop`,
`topBar`, `bottomBar`, `image`, `button`, `counter`, `navButton`, `overlay`).

## Headless usage

The interaction engine is exported for building a fully custom shell:

```ts
import {
  useImageZoomPan,
  useSlideNavigation,
  useGestureHandler,
  useBarMeasure,
  useBodyScrollLock,
  useFocusTrap,
  MIN_SCALE,
  MAX_SCALE,
} from "@jekrch/react-viewport-lightbox";
```

The pure geometry/threshold helpers (`clampTranslate`, `resolveSlideDirection`) are
exported too.

## License

MIT © jekrch
