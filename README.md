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
- **Touch and desktop.** Wheel/pinch zoom, drag/swipe navigation, swipe down to
  close, double-tap and double-click, keyboard zoom/pan/navigation, rubber-band
  edges.
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

| Prop                   | Type                                                 | Default    | Description                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`                | `ViewerItem[]`                                       | required   | Images to display.                                                                                                                                                                                                                                                                                                                       |
| `index`                | `number`                                             | required   | Controlled index of the active item.                                                                                                                                                                                                                                                                                                     |
| `onIndexChange`        | `(index: number) => void`                            | required   | Called when navigation changes the index.                                                                                                                                                                                                                                                                                                |
| `onNavigate`           | `(direction: "prev" \| "next") => void`              | optional   | Fired when a slide starts (before `onIndexChange`), so overlays can animate out in sync with the image.                                                                                                                                                                                                                                  |
| `onClose`              | `() => void`                                         | required   | Called after the exit animation completes.                                                                                                                                                                                                                                                                                               |
| `onEscape`             | `() => boolean`                                      | optional   | Called on Escape before the viewer closes. Return `true` to mark the key handled and veto the default close (e.g. dismiss your own overlay first); `false`/`undefined` falls through to closing.                                                                                                                                         |
| `onCloseStart`         | `() => void`                                         | optional   | Called synchronously when a close begins (button, Escape, backdrop, back button, `ctx.close`), before the exit animation. Fires once.                                                                                                                                                                                                    |
| `onOpenComplete`       | `() => void`                                         | optional   | Called once the open settles: when the zoom from the thumbnail lands, or when the fade-in ends. Not called if the viewer closes first.                                                                                                                                                                                                   |
| `history`              | `boolean \| { param?, value? }`                      | `false`    | Give the open viewer a browser-history entry so back closes it. `{ param: "photo" }` also names the open item in the URL. See [Back button & deep links](#back-button--deep-links).                                                                                                                                                      |
| `stageShift`           | `"up" \| "down" \| string \| null`                   | `null`     | Push the image stage out of view for an overlay (`"up"`/`"down"` = a full viewport; any other string is a CSS transform). Changes animate; mounting already shifted starts in place.                                                                                                                                                     |
| `getOrigin`            | `(index, item) => HTMLElement \| ViewerRect \| null` | optional   | Enables a shared-element "zoom from thumbnail" open/close transition. Return the source element (typically your ref, or use `originFromAttribute`) for the given index — its rect, corner radius, and any `object-fit: cover` crop are read for you — or a bare `ViewerRect`, or `null` to fall back to the fade. Honors reduced-motion. |
| `thumbnailCrop`        | `boolean`                                            | `true`     | Honor a `getOrigin` element's `object-fit: cover` crop. `false` treats every source element's own box as the flight's target, cropped or not (the behavior before 0.9).                                                                                                                                                                  |
| `zoom`                 | `boolean`                                            | `true`     | Enable wheel/pinch/double-tap zoom + pan.                                                                                                                                                                                                                                                                                                |
| `zoomToCursor`         | `boolean`                                            | `true`     | Anchor wheel/pinch zoom on the pointer: scrolling zooms toward the cursor and a pinch zooms toward the gesture midpoint. Set `false` to zoom about the viewport center.                                                                                                                                                                  |
| `showCounter`          | `boolean`                                            | `true`     | Show the `index / total` counter.                                                                                                                                                                                                                                                                                                        |
| `showZoomControls`     | `boolean`                                            | `true`     | Show the built-in zoom in/out/reset buttons. Independent of `zoom` (the gestures): set `false` to keep zoom/pan while a consumer overlay owns the chrome. Auto-hidden on touch-primary devices and while content is shifted.                                                                                                             |
| `disableNavigation`    | `boolean`                                            | `false`    | Suppress built-in arrow/Home/End key navigation and swipe commit without tearing the viewer down (e.g. while an overlay handles left/right itself). Does not hide the on-screen nav buttons.                                                                                                                                             |
| `loop`                 | `boolean`                                            | `false`    | Wrap around at the ends (buttons + arrow keys).                                                                                                                                                                                                                                                                                          |
| `closeOnBackdropClick` | `boolean`                                            | `false`    | Close the viewer when the empty area around the image is clicked. Image, bars, and controls are unaffected. Off while the stage is shifted.                                                                                                                                                                                              |
| `swipeToClose`         | `boolean`                                            | `true`     | Drag the unzoomed image up or down to close: it follows the drag and shrinks while the backdrop fades, and a far enough or fast enough release closes (collapsing into the thumbnail with `getOrigin`). Touch and mouse. Off while the stage is shifted.                                                                                 |
| `renderHeader`         | `(ctx) => ReactNode`                                 | optional   | Top-left title area.                                                                                                                                                                                                                                                                                                                     |
| `renderHeaderActions`  | `(ctx) => ReactNode`                                 | optional   | Extra top-right buttons (before Close).                                                                                                                                                                                                                                                                                                  |
| `renderHeaderMeta`     | `(ctx) => ReactNode`                                 | optional   | A small right-aligned line under the top-right buttons (a byline, a date). Counted in `ctx.topBarHeight`.                                                                                                                                                                                                                                |
| `renderNavStart`       | `(ctx) => ReactNode`                                 | optional   | Pinned to the left edge of the nav row (e.g. a details toggle); costs no extra height, nav group stays centered.                                                                                                                                                                                                                         |
| `renderNavEnd`         | `(ctx) => ReactNode`                                 | optional   | Pinned to the right edge of the nav row.                                                                                                                                                                                                                                                                                                 |
| `navSlotPlacement`     | `"edge" \| "inline"`                                 | `"edge"`   | Where `renderNavStart`/`renderNavEnd` sit: `"edge"` pins them to the row edges (nav group stays optically centered); `"inline"` places them directly flanking the arrows as one centered cluster.                                                                                                                                        |
| `navHeight`            | `number \| string`                                   | `2.375rem` | Size of the prev/next nav arrows. A number is pixels; a string is used verbatim. Sets `--rvl-nav-height`, so it can also be themed in CSS.                                                                                                                                                                                               |
| `navInset`             | `number \| string`                                   | `1.3rem`   | Gap between the bottom nav controls and the viewport's bottom edge (floored by the safe-area inset). Number is pixels; string verbatim. Sets `--rvl-nav-inset`.                                                                                                                                                                          |
| `counterFontSize`      | `number \| string`                                   | `0.29×`    | Overrides the counter font size (which otherwise scales with `navHeight`). Number is pixels; string verbatim. Sets `--rvl-counter-font-size`.                                                                                                                                                                                            |
| `renderFooter`         | `(ctx) => ReactNode`                                 | optional   | Content below the nav row.                                                                                                                                                                                                                                                                                                               |
| `hint`                 | `boolean \| (ctx) => ReactNode`                      | `false`    | A muted gesture-hint line below the footer. `true` shows built-in text matched to touch/desktop, item count, `zoom`, and `disableNavigation`; a function supplies your own (e.g. i18n). Hidden while zoomed or while the stage is shifted.                                                                                               |
| `renderOverlay`        | `(ctx) => ReactNode`                                 | optional   | Drawers and graphs layered over the image.                                                                                                                                                                                                                                                                                               |
| `renderImageOverlay`   | `(ctx) => ReactNode`                                 | optional   | Content rendered inside the image wrapper, pinned to the active image's own box (a badge, watermark, or corner caption) so it tracks the letterboxed image's corners instead of floating in the surrounding dead space. Non-interactive by default; gate on `ctx.isZoomed`.                                                              |
| `classNames`           | `Partial<Record<ViewerSlot, string>>`                | optional   | Per-slot `className` overrides.                                                                                                                                                                                                                                                                                                          |
| `icons`                | `Partial<ViewerIcons>`                               | optional   | Override `close`, `zoomIn`, `zoomOut`, `prev`, and `next`.                                                                                                                                                                                                                                                                               |
| `ariaLabel`            | `string`                                             | item `alt` | Dialog label.                                                                                                                                                                                                                                                                                                                            |

### `ViewerItem`

```ts
interface ViewerItem<TData = unknown> {
  id: string;
  src: string; // final url
  srcSet?: string; // responsive candidates, forwarded to <img srcset>
  sizes?: string; // sizes for the srcSet candidates
  alt?: string;
  thumbnail?: string; // low-res stand-in shown while src loads (see below)
  data?: TData; // optional per-slide payload (see below)
}
```

Supplying `srcSet`/`sizes` is the biggest mobile win you can hand the viewer: a
phone fetches and decodes an appropriately sized image instead of the
full-resolution `src`. The neighbor preloads mirror them, so warming fetches the
same resource the slide will render.

```tsx
const items: ViewerItem[] = [
  {
    id: "1",
    src: "/photos/1-1600.jpg", // fallback for browsers without srcSet support
    srcSet: "/photos/1-800.jpg 800w, /photos/1-1600.jpg 1600w, /photos/1-2400.jpg 2400w",
    sizes: "100vw", // the image fills the viewport, so pick a candidate ~viewport-wide
    alt: "First",
  },
];
```

`sizes` tells the browser how wide the image will render so it can pick the right
`srcSet` candidate before layout. Since the viewer shows one image across the
full viewport, `"100vw"` is the usual value.

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

If your tiles already carry the item's id in a data attribute, skip the refs:

```tsx
<img data-photo-id={photo.id} src={photo.thumb} … />

<ImageViewer getOrigin={originFromAttribute("data-photo-id")} … />
```

`originFromAttribute(attr, { value?, root? })` looks the tile up by
`value(item)` (default `item.id`, escaped for the selector), optionally inside
`root()`, and returns `null` when it isn't on the page.

#### Thumbnail-first open

The open never waits on the network for an image the page already shows. When the
`getOrigin` element contains an `<img>` that has loaded (your gallery tile), the
viewer flies **that** image out at once, sized to the box the full image will
fill, and swaps in `src` (decoded off-screen first, so the swap is seamless) as
soon as it's ready. If the full image is still loading after half a second, a
small spinner shows over the stand-in.

There's nothing to configure. Without a `getOrigin` image, set
`ViewerItem.thumbnail` to get the same stand-in. When the tile already shows the
full `src`, there's nothing to gain and the viewer loads `src` directly as
before.

#### Cropped thumbnails

A gallery tile is usually a **crop** — a fixed box with `object-fit: cover` over
it — so it shows a slice of its image rather than the whole thing. That is
handled for you, and it is worth knowing what the viewer does with it, because
the naive version of this transition looks wrong in two specific ways.

Flying an uncropped image into the tile's literal box **squashes** it for the
length of the animation, hardest on exactly the images the crop works hardest
on. So the flight targets the rect the whole image would occupy at the crop's
own scale: the slice on screen still lines up with the tile, and the picture
keeps its proportions the whole way. `object-position` is honored, so a tile
that holds its crop off-centre (`center 22%` for a face, say) still lines up.

That leaves the parts the tile has no room for painted outside it — appearing
from nowhere on the first frame of an expand, and still on screen at the end of
a collapse, to blink out a frame later when the viewer unmounts. So they fade,
across the flight, on a mask that holds still while its opacity goes. Fading
rather than cropping inward is deliberate: an aperture closing onto the tile
lands in the right place, but a hard edge sweeping across the picture at the end
of a flight reads as another thing happening rather than as the flight
finishing.

None of it needs configuration — hand over the element and it applies when the
element crops. Pass `thumbnailCrop={false}` to switch it off.

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

`ctx` is memoized, and its actions (`goPrev`, `goNext`, `goTo`, `close`, `zoomIn`,
`zoomOut`, `resetZoom`, `setContentShift`) keep the same identity for the viewer's
whole life. A slot re-runs only when your component re-renders (new render
functions) or a `ctx` value changes, not on the viewer's own internal renders
during a swipe. Wrap heavy overlay content in `React.memo` to benefit fully.

### Buttons for your slots

`ViewerButton` is the viewer's own chrome button, for header actions and nav-row
toggles, so they match the built-in zoom and close buttons:

```tsx
<ViewerButton label="Details" active={drawerOpen} onClick={toggleDrawer}>
  <InfoIcon />
</ViewerButton>
```

`label` is the accessible name and the tooltip (`title` overrides the tooltip).
`active` marks a toggle: it sets `aria-pressed` and the `is-active` style; leave it
out for a plain action button. Clicks don't reach the backdrop. Restyle it with
`classNames.button` or the `--rvl-btn-*` properties rather than by class name.

### Drawers and `stageShift`

To slide the image out of the way for a drawer, describe where the stage should be
and the viewer animates it there:

```tsx
<ImageViewer
  {...props}
  stageShift={drawerOpen ? "up" : null}
  onNavigate={() => setDrawerOpen(false)}
  renderNavStart={() => (
    <ViewerButton label="Details" active={drawerOpen} onClick={() => setDrawerOpen((d) => !d)}>
      <InfoIcon />
    </ViewerButton>
  )}
  renderOverlay={(ctx) => <MyDrawer open={drawerOpen} item={ctx.item} />}
/>
```

A viewer that mounts with `stageShift` already set (opened straight onto the
details) starts in place rather than sliding there. While shifted, the zoom
controls hide and closing fades rather than collapsing into the thumbnail, since
the image is off screen.

For finer control, such as snapping a change with no animation, use the imperative
`ctx.setContentShift(transform, animate)`. A non-null value overrides the prop.
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
    <ViewerButton
      label="Details"
      active={drawer}
      onClick={() => {
        const next = !drawer;
        setSlideDir(null);
        setDrawer(next);
        ctx.setContentShift(next ? "translateY(-100vh)" : null);
      }}
    >
      <InfoIcon />
    </ViewerButton>
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

## Gestures & keys

| Input                      | Unzoomed                 | Zoomed        |
| -------------------------- | ------------------------ | ------------- |
| Swipe / drag left or right | Previous / next          | Pan           |
| Swipe / drag up or down    | Close (`swipeToClose`)   | Pan           |
| Pinch, wheel               | Zoom                     | Zoom          |
| Double-tap, double-click   | Zoom in                  | Reset         |
| `←` `→`                    | Previous / next          | Pan           |
| `↑` `↓`                    | —                        | Pan           |
| `Home` `End`               | First / last             | —             |
| `+` (or `=`), `-`          | Zoom in / out            | Zoom in / out |
| `0`                        | —                        | Reset         |
| `Esc`                      | Close (after `onEscape`) | Close         |

Keys typed into a text field (a search box in your drawer, say) are left to the
field, and browser shortcuts with `Ctrl`/`Cmd`/`Alt` pass through. Zoom keys are
off with `zoom={false}` and while the stage is shifted; navigation keys are off
with `disableNavigation`.

### Accessibility

The viewer is a `role="dialog"` with `aria-modal="true"`, traps focus while open,
and restores it on close. Every built-in control has a label, slide changes are
announced through a polite live region, and reduced motion swaps the zoom and
slides for instant cuts. Screen readers that ignore `aria-modal` can still reach
the page behind with their reading cursor; if that matters for your app, set
`inert` on your page's root while the viewer is open (render the viewer outside
that root, e.g. in a portal, so it isn't inert too):

```tsx
useEffect(() => {
  const root = document.getElementById("app")!;
  root.inert = open;
  return () => {
    root.inert = false;
  };
}, [open]);
```

## Back button & deep links

On phones, the back button or back gesture should close a full-screen viewer, not
leave the page. Pass `history` to give the open viewer its own history entry:

```tsx
<ImageViewer {...props} history={{ param: "photo" }} />
```

- Opening pushes one entry. With `param`, its URL names the open item
  (`?photo=<id>`, or whatever `value(item)` returns), and paging updates it in
  place, so one back press closes the viewer however far the user paged.
- Back runs through `onEscape` first, so an open drawer can claim the press (return
  `true`) the same way it claims Escape. The viewer stays open and re-arms its
  entry.
- Closing from the UI steps back off the entry, restoring the URL you opened from.
  A deep-linked open (`?photo=…` already in the URL) strips the param from the
  entry underneath, so backing out lands on a closed-viewer URL.

`history: true` gives the back-button behavior without touching the URL. While it's
on, don't write the same param yourself, and keep `history.state` intact in any
`replaceState` you make while the viewer is open (the entry is recognized by a key
in it).

## Page scroll lock

While the viewer is open, the page behind it is locked in place: it can't scroll,
and it keeps its exact scroll position when the viewer closes. Locking hides the
page's scrollbar. On desktops with space-taking scrollbars, that would normally
widen the viewport and nudge the page sideways, so the lock offsets the page by the
width the viewport gained and nothing in it moves. This is always on and needs no
setup. A root that keeps its scrollbar space anyway (`scrollbar-gutter: stable`, or
`overflow-y: scroll` on `<html>`) gets no offset, because nothing widens.

`position: fixed` elements in your page (a fixed header, a floating button) are laid
out against the viewport rather than the page, so the lock can't hold them still by
itself. While locked, it sets `--rvl-scrollbar-width` on `<html>` to the width it's
compensating for, so they can opt in with one line:

```css
.site-header {
  padding-right: var(--rvl-scrollbar-width, 0px);
}
.chat-button {
  right: calc(1rem + var(--rvl-scrollbar-width, 0px));
}
```

The variable is only set while there's a width to compensate for (never on touch
devices, overlay scrollbars, or a stable gutter, where nothing shifts), and is removed
when the viewer closes, so keep the `0px` fallback.

## Theming

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

```css
.my-gallery {
  --rvl-accent: #ff5c8a;
  --rvl-overlay-bg: rgba(10, 10, 20, 0.96);
}
```

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
`navButton`, `navStart`, `navEnd`, `overlay`, `hint`, `spinner`). `.rvl-hint` is also safe to reuse in your own footer
for a line that matches the built-in hint.

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
  useViewerHistory,
  useSwipeDismiss,
  MIN_SCALE,
  MAX_SCALE,
} from "@jekrch/react-viewport-lightbox";
```

Swipe-to-close is opt-in at the hook level: pass the handlers `useSwipeDismiss`
returns as `useGestureHandler`'s last argument, and call its `flyOut()` when a
close has no thumbnail to collapse into. Without them, vertical drags do nothing.

The pure geometry/threshold helpers are exported too: `clampTranslate`,
`resolveSlideDirection`, and the thumbnail-crop geometry behind the shared-element
zoom (`coverRect`, `cropInsets`, `cropsAnything`, `cropFeather`, `cropMask`,
`cropFadeProgress`, `parseObjectPosition`).

## License

MIT © jekrch
