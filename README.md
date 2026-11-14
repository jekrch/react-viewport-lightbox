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

<!-- Hero clip goes here: a 5–8 s phone recording of a cropped-tile zoom, a
swipe, and a swipe-to-close. Upload the MP4 in a GitHub comment/issue and
paste the user-attachments URL on its own line; GitHub renders it as video. -->

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
import { useLightbox, type ViewerItem } from "@jekrch/react-viewport-lightbox/lazy";
import "@jekrch/react-viewport-lightbox/styles.css";

const items: ViewerItem[] = [
  { id: "1", src: "/photos/1.jpg", thumbnail: "/photos/1-thumb.jpg", alt: "First" },
  { id: "2", src: "/photos/2.jpg", thumbnail: "/photos/2-thumb.jpg", alt: "Second" },
];

export function Gallery() {
  const lightbox = useLightbox(items, { loop: true });

  return (
    <>
      {items.map((item, i) => (
        <button key={item.id} {...lightbox.triggerProps(i)}>
          <img src={item.thumbnail} alt={item.alt} />
        </button>
      ))}
      {lightbox.viewer}
    </>
  );
}
```

That's the whole setup. The image zooms out of the tile you clicked and back
into it on close. The viewer's code loads when the page goes idle, and each
photo starts loading when its tile is hovered or pressed. From `/lazy`, all of
it adds about 1 KB gzip to your main bundle until someone opens an image.

### `useLightbox(items, options?)`

`options` takes any [`ImageViewer` prop](#props) and passes it through, plus:

| Option     | Type                              | Default  | Description                                                                                                                       |
| ---------- | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `preload`  | `"idle"` \| `"intent"` \| `false` | `"idle"` | `"idle"`: the viewer's code once the page is idle, and each photo on hover/press. `"intent"`: only on hover/press. `false`: none. |
| `fallback` | `ReactNode`                       | `null`   | `/lazy` only. Shown while the viewer's code loads, if an open beats the preload.                                                  |

`onIndexChange` and `onClose` are optional here; the hook keeps the index and
open state itself and still calls yours. Pass `getOrigin` to zoom from somewhere
other than the trigger. With `history: { param: "photo" }`, a page loaded with
`?photo=<id>` opens on that item.

It returns:

| Field                            | Description                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triggerProps(index, handlers?)` | Spread on the element that opens item `index` (a button, link, card, or `<img>`). Opens on click, preloads on hover/press, and marks it as the zoom origin. Modified clicks (new tab) are left to the browser. |
| `viewer`                         | Render once, anywhere. The viewer while open, else `null`.                                                                                                                                                     |
| `open(index)`                    | Open on `index` from your own code.                                                                                                                                                                            |
| `close()`                        | Unmount the viewer at once, with no exit animation (for a route change). The viewer's own controls and `ctx.close()` animate.                                                                                  |
| `isOpen`, `index`                | Current state.                                                                                                                                                                                                 |

Put your own handlers in `handlers` rather than after the spread, so both run.
Calling `e.preventDefault()` in your `onClick` keeps the viewer closed:

```tsx
<a href={`/photos/${item.id}`} {...lightbox.triggerProps(i, { onClick: track })}>
```

`useLightbox` is in the main entry too, wired to the eagerly loaded viewer.

### `ImageViewer` directly

The hook renders `ImageViewer` (or `LazyImageViewer`), which you can also
control yourself:

```tsx
import { useState } from "react";
import { ImageViewer } from "@jekrch/react-viewport-lightbox";

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

| Prop                   | Type                                                 | Default    | Description                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`                | `ViewerItem[]`                                       | required   | Images to display.                                                                                                                                                                                                                                                                                                                                                                                      |
| `index`                | `number`                                             | required   | Controlled index of the active item.                                                                                                                                                                                                                                                                                                                                                                    |
| `onIndexChange`        | `(index: number) => void`                            | required   | Called when navigation changes the index.                                                                                                                                                                                                                                                                                                                                                               |
| `onNavigate`           | `(direction: "prev" \| "next") => void`              | optional   | Fired when a slide starts (before `onIndexChange`), so overlays can animate out in sync with the image. Includes `Home`/`End` and `ctx.goTo` jumps.                                                                                                                                                                                                                                                     |
| `onClose`              | `() => void`                                         | required   | Called after the exit animation completes.                                                                                                                                                                                                                                                                                                                                                              |
| `onEscape`             | `() => boolean`                                      | optional   | Called on Escape before the viewer closes. Return `true` to mark the key handled and veto the default close (e.g. dismiss your own overlay first); `false`/`undefined` falls through to closing.                                                                                                                                                                                                        |
| `onCloseStart`         | `() => void`                                         | optional   | Called synchronously when a close begins (button, Escape, backdrop, back button, `ctx.close`), before the exit animation. Fires once.                                                                                                                                                                                                                                                                   |
| `onOpenComplete`       | `() => void`                                         | optional   | Called once the open settles: when the zoom from the thumbnail lands, or when the fade-in ends. Not called if the viewer closes first.                                                                                                                                                                                                                                                                  |
| `history`              | `boolean \| { param?, value?, paging? }`             | `false`    | Give the open viewer a browser-history entry so back closes it. `{ param: "photo" }` also names the open item in the URL; `paging: "push"` makes back step through viewed items. See [Back button & deep links](docs/guides/history.md).                                                                                                                                                                |
| `stageShift`           | `"up" \| "down" \| string \| null`                   | `null`     | Push the image stage out of view for an overlay (`"up"`/`"down"` = a full viewport; any other string is a CSS transform). Changes animate; mounting already shifted starts in place. See [Drawers](docs/guides/drawers.md).                                                                                                                                                                             |
| `getOrigin`            | `(index, item) => HTMLElement \| ViewerRect \| null` | optional   | Enables a shared-element "zoom from thumbnail" open/close transition. Return the source element (typically your ref, or use `originFromAttribute`) for the given index — its rect, corner radius, and any `object-fit: cover` crop are read for you — or a bare `ViewerRect`, or `null` to fall back to the fade. Honors reduced-motion. See [Zoom from thumbnail](docs/guides/zoom-from-thumbnail.md). |
| `thumbnailCrop`        | `boolean`                                            | `true`     | Honor a `getOrigin` element's `object-fit: cover` crop. `false` treats every source element's own box as the flight's target, cropped or not (the behavior before 0.9).                                                                                                                                                                                                                                 |
| `zoom`                 | `boolean`                                            | `true`     | Enable wheel/pinch/double-tap zoom + pan.                                                                                                                                                                                                                                                                                                                                                               |
| `wheel`                | `"pan" \| "zoom"`                                    | `"pan"`    | `"pan"`: a trackpad pinch or Ctrl+wheel zooms, a plain wheel pans a zoomed image and is otherwise left to the browser (trackpad swipe-back keeps working). `"zoom"`: every wheel event zooms.                                                                                                                                                                                                           |
| `tapToToggleChrome`    | `boolean`                                            | `false`    | A single tap or click on the image hides the bars; another brings them back. Waits out the double-tap window. `ctx.chromeHidden` reports it.                                                                                                                                                                                                                                                            |
| `zoomToCursor`         | `boolean`                                            | `true`     | Anchor wheel/pinch zoom on the pointer: scrolling zooms toward the cursor and a pinch zooms toward the gesture midpoint. Set `false` to zoom about the viewport center.                                                                                                                                                                                                                                 |
| `showCounter`          | `boolean`                                            | `true`     | Show the `index / total` counter.                                                                                                                                                                                                                                                                                                                                                                       |
| `showZoomControls`     | `boolean`                                            | `true`     | Show the built-in zoom in/out/reset buttons. Independent of `zoom` (the gestures): set `false` to keep zoom/pan while a consumer overlay owns the chrome. Auto-hidden on touch-primary devices and while content is shifted.                                                                                                                                                                            |
| `disableNavigation`    | `boolean`                                            | `false`    | Suppress built-in arrow/Home/End key navigation and swipe commit without tearing the viewer down (e.g. while an overlay handles left/right itself). Does not hide the on-screen nav buttons.                                                                                                                                                                                                            |
| `loop`                 | `boolean`                                            | `false`    | Wrap around at the ends (buttons + arrow keys).                                                                                                                                                                                                                                                                                                                                                         |
| `closeOnBackdropClick` | `boolean`                                            | `false`    | Close the viewer when the empty area around the image is clicked, including the empty ends of the nav row. Image, bars, and controls are unaffected; clicks within `--rvl-nav-hit-slop` of a nav control do nothing. Off while the stage is shifted.                                                                                                                                                    |
| `swipeToClose`         | `boolean`                                            | `true`     | Drag the unzoomed image up or down to close: it follows the drag and shrinks while the backdrop fades, and a far enough or fast enough release closes (collapsing into the thumbnail with `getOrigin`). Touch and mouse. Off while the stage is shifted.                                                                                                                                                |
| `preloadCount`         | `number`                                             | `1`        | Images on each side of the active one to fetch and decode in the background, so navigating doesn't wait on the network. Follows `loop`. Drops to `0` when the browser reports Save-Data, unless set explicitly. See [Loading fast](docs/guides/loading-fast.md).                                                                                                                                        |
| `renderHeader`         | `(ctx) => ReactNode`                                 | optional   | Top-left title area.                                                                                                                                                                                                                                                                                                                                                                                    |
| `renderHeaderActions`  | `(ctx) => ReactNode`                                 | optional   | Extra top-right buttons (before Close).                                                                                                                                                                                                                                                                                                                                                                 |
| `renderHeaderMeta`     | `(ctx) => ReactNode`                                 | optional   | A small right-aligned line under the top-right buttons (a byline, a date). Counted in `ctx.topBarHeight`.                                                                                                                                                                                                                                                                                               |
| `renderNavStart`       | `(ctx) => ReactNode`                                 | optional   | Pinned to the left edge of the nav row (e.g. a details toggle); costs no extra height, nav group stays centered.                                                                                                                                                                                                                                                                                        |
| `renderNavEnd`         | `(ctx) => ReactNode`                                 | optional   | Pinned to the right edge of the nav row.                                                                                                                                                                                                                                                                                                                                                                |
| `navSlotPlacement`     | `"edge" \| "inline"`                                 | `"edge"`   | Where `renderNavStart`/`renderNavEnd` sit: `"edge"` pins them to the row edges (nav group stays optically centered); `"inline"` places them directly flanking the arrows as one centered cluster.                                                                                                                                                                                                       |
| `navHeight`            | `number \| string`                                   | `2.375rem` | Size of the prev/next nav arrows. A number is pixels; a string is used verbatim. Sets `--rvl-nav-height`, so it can also be themed in CSS.                                                                                                                                                                                                                                                              |
| `navInset`             | `number \| string`                                   | `1.3rem`   | Gap between the bottom nav controls and the viewport's bottom edge (floored by the safe-area inset). Number is pixels; string verbatim. Sets `--rvl-nav-inset`.                                                                                                                                                                                                                                         |
| `counterFontSize`      | `number \| string`                                   | `0.29×`    | Overrides the counter font size (which otherwise scales with `navHeight`). Number is pixels; string verbatim. Sets `--rvl-counter-font-size`.                                                                                                                                                                                                                                                           |
| `renderFooter`         | `(ctx) => ReactNode`                                 | optional   | Content below the nav row.                                                                                                                                                                                                                                                                                                                                                                              |
| `hint`                 | `boolean \| (ctx) => ReactNode`                      | `false`    | A muted gesture-hint line below the footer. `true` shows built-in text matched to touch/desktop, item count, `zoom`, and `disableNavigation`; a function supplies your own (e.g. i18n). Hidden while zoomed or while the stage is shifted.                                                                                                                                                              |
| `renderOverlay`        | `(ctx) => ReactNode`                                 | optional   | Drawers and graphs layered over the image. See [Drawers](docs/guides/drawers.md).                                                                                                                                                                                                                                                                                                                       |
| `renderImageOverlay`   | `(ctx) => ReactNode`                                 | optional   | Content rendered inside the image wrapper, pinned to the active image's own box (a badge, watermark, or corner caption) so it tracks the letterboxed image's corners instead of floating in the surrounding dead space. Fades in with the bars, out as a close begins, and quickly on each new slide. Non-interactive by default; gate on `ctx.isZoomed`.                                               |
| `renderError`          | `(ctx, retry) => ReactNode`                          | optional   | Shown, centered, when the active image fails to load. Default: "Couldn't load image" and a Retry button; `retry()` reloads the image. Return `null` to show nothing. Zoom is off while it shows.                                                                                                                                                                                                        |
| `accent`               | `string`                                             | optional   | Accent color for active and focus states. Sets `--rvl-accent` on the viewer.                                                                                                                                                                                                                                                                                                                            |
| `classNames`           | `Partial<Record<ViewerSlot, string>>`                | optional   | Per-slot `className` overrides. See [Theming](docs/guides/theming.md).                                                                                                                                                                                                                                                                                                                                  |
| `icons`                | `Partial<ViewerIcons>`                               | optional   | Override `close`, `zoomIn`, `zoomOut`, `prev`, and `next`.                                                                                                                                                                                                                                                                                                                                              |
| `ariaLabel`            | `string`                                             | item `alt` | Dialog label.                                                                                                                                                                                                                                                                                                                                                                                           |

### `ViewerItem`

```ts
type ViewerItem<TData = unknown> = {
  id: string;
  src: string; // final url
  srcSet?: string; // responsive candidates, forwarded to <img srcset>
  sizes?: string; // sizes for the srcSet candidates
  zoomSrc?: string; // sharper source fetched on a zoom past 1.5x
  alt?: string;
  thumbnail?: string; // low-res placeholder shown at once while src loads
  kind?: "image"; // reserved for future slide types; leave unset
  data: TData; // your own per-slide fields; optional when TData is left out
};
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

Zooming in past 1.5× swaps in a bigger `srcSet` candidate (or `zoomSrc`) once it
has decoded; see [sharp zoom](docs/guides/loading-fast.md#sharp-zoom-without-big-opens).
`thumbnail` is shown at once while `src` loads; see
[thumbnail-first open](docs/guides/zoom-from-thumbnail.md#thumbnail-first-open).
`data` carries your own fields to the render slots, typed; see
[per-slide details](docs/guides/slots.md#per-slide-details).

## Gestures & keys

| Input                      | Unzoomed                 | Zoomed        |
| -------------------------- | ------------------------ | ------------- |
| Swipe / drag left or right | Previous / next          | Pan (coasts)  |
| Swipe / drag up or down    | Close (`swipeToClose`)   | Pan (coasts)  |
| Pinch, Ctrl+wheel          | Zoom                     | Zoom          |
| Wheel, two-finger scroll   | Browser (swipe-back)     | Pan           |
| Double-tap, double-click   | Zoom in                  | Reset         |
| Tap (`tapToToggleChrome`)  | Hide / show bars         | Hide / show   |
| `←` `→`                    | Previous / next          | Pan           |
| `↑` `↓`                    | —                        | Pan           |
| `Home` `End`               | First / last             | —             |
| `+` (or `=`), `-`          | Zoom in / out            | Zoom in / out |
| `0`                        | —                        | Reset         |
| `Esc`                      | Close (after `onEscape`) | Close         |

With `wheel="zoom"`, a plain wheel zooms as well.

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

## Guides

- [Zoom from thumbnail](docs/guides/zoom-from-thumbnail.md): `getOrigin`, thumbnail-first open, cropped tiles.
- [Loading fast](docs/guides/loading-fast.md): the `/lazy` entry, `preloadViewer`, `prefetchItem`, `preloadCount`.
- [Slots & `ViewerContext`](docs/guides/slots.md): render slots, buttons for them, per-slide `data`.
- [Drawers and `stageShift`](docs/guides/drawers.md): info panels that move the image out of the way.
- [Back button & deep links](docs/guides/history.md): `history`, shareable `?photo=` URLs, `ctx.close(then)`.
- [Page scroll lock](docs/guides/scroll-lock.md): how the page holds still, and `--rvl-scrollbar-width`.
- [Theming](docs/guides/theming.md): CSS custom properties, `classNames`, the iOS chrome tint.
- [Headless usage](docs/guides/headless.md): the exported hooks, for your own shell.

## License

MIT © jekrch. The default icons are from [Lucide](https://lucide.dev) (ISC); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
