# @jekrch/react-viewport-lightbox

[![npm version](https://img.shields.io/npm/v/@jekrch/react-viewport-lightbox.svg)](https://www.npmjs.com/package/@jekrch/react-viewport-lightbox)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@jekrch/react-viewport-lightbox)](https://bundlephobia.com/package/@jekrch/react-viewport-lightbox)
[![coverage](https://codecov.io/gh/jekrch/react-viewport-lightbox/branch/main/graph/badge.svg)](https://codecov.io/gh/jekrch/react-viewport-lightbox)
[![types](https://img.shields.io/npm/types/@jekrch/react-viewport-lightbox.svg)](https://www.npmjs.com/package/@jekrch/react-viewport-lightbox)
[![license](https://img.shields.io/npm/l/@jekrch/react-viewport-lightbox.svg)](./LICENSE)

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

| Prop                  | Type                                    | Default    | Description                                                                                                      |
| --------------------- | --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `items`               | `ViewerItem[]`                          | required   | Images to display.                                                                                               |
| `index`               | `number`                                | required   | Controlled index of the active item.                                                                             |
| `onIndexChange`       | `(index: number) => void`               | required   | Called when navigation changes the index.                                                                        |
| `onNavigate`          | `(direction: "prev" \| "next") => void` | optional   | Fired when a slide starts (before `onIndexChange`), so overlays can animate out in sync with the image.          |
| `onClose`             | `() => void`                            | required   | Called after the exit animation completes.                                                                       |
| `zoom`                | `boolean`                               | `true`     | Enable wheel/pinch/double-tap zoom + pan.                                                                        |
| `showCounter`         | `boolean`                               | `true`     | Show the `index / total` counter.                                                                                |
| `loop`                | `boolean`                               | `false`    | Wrap around at the ends (buttons + arrow keys).                                                                  |
| `renderHeader`        | `(ctx) => ReactNode`                    | optional   | Top-left title area.                                                                                             |
| `renderHeaderActions` | `(ctx) => ReactNode`                    | optional   | Extra top-right buttons (before Close).                                                                          |
| `renderNavStart`      | `(ctx) => ReactNode`                    | optional   | Pinned to the left edge of the nav row (e.g. a details toggle); costs no extra height, nav group stays centered. |
| `renderNavEnd`        | `(ctx) => ReactNode`                    | optional   | Pinned to the right edge of the nav row.                                                                         |
| `renderFooter`        | `(ctx) => ReactNode`                    | optional   | Content below the nav row.                                                                                       |
| `renderOverlay`       | `(ctx) => ReactNode`                    | optional   | Drawers and graphs layered over the image.                                                                       |
| `classNames`          | `Partial<Record<ViewerSlot, string>>`   | optional   | Per-slot `className` overrides.                                                                                  |
| `icons`               | `Partial<ViewerIcons>`                  | optional   | Override `close`, `zoomIn`, `zoomOut`, `prev`, and `next`.                                                       |
| `ariaLabel`           | `string`                                | item `alt` | Dialog label.                                                                                                    |

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

## Slots & `ViewerContext`

Every `render*` slot receives a `ViewerContext` with navigation, zoom, and layout
state so slot content can coordinate with the viewer:

```ts
interface ViewerContext<TData = unknown> {
  items: ViewerItem<TData>[];
  index: number;
  item: ViewerItem<TData>; // item.data holds your per-slide payload
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
| `--rvl-btn-bg` / `--rvl-btn-bg-hover` | translucent white |
| `--rvl-radius`                        | `4px`             |
| `--rvl-anim-duration`                 | `250ms`           |

```css
.my-gallery {
  --rvl-accent: #ff5c8a;
  --rvl-overlay-bg: rgba(10, 10, 20, 0.96);
}
```

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
