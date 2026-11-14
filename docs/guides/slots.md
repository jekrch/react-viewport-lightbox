# Slots & `ViewerContext`

[← README](../../README.md) · [All guides](README.md)

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
  goTo: (index: number) => void; // slides there; fires onNavigate like a step
  close: (then?: () => void) => void; // `then` runs once the viewer leaves its history entry

  isZoomed: boolean;
  displayScale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  isTouchDevice: boolean;
  chromeHidden: boolean; // tapToToggleChrome has hidden the bars

  // Measured bar heights so overlays can size between the bars.
  topBarHeight: number;
  bottomBarHeight: number;
}
```

`ctx` is memoized, and its actions (`goPrev`, `goNext`, `goTo`, `close`, `zoomIn`,
`zoomOut`, `resetZoom`) keep the same identity for the viewer's
whole life. A slot re-runs only when your component re-renders (new render
functions) or a `ctx` value changes, not on the viewer's own internal renders
during a swipe. Wrap heavy overlay content in `React.memo` to benefit fully.

## Buttons for your slots

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

## Per-slide details

Anything richer than `alt` (a caption, credit line, tags, links) can live on the
item itself in its `data` field, instead of keeping a parallel array or
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
    // ctx.item.data is typed as Detail, always matches the current slide,
    // and updates as you navigate.
    <div className="my-details">
      <h2>{ctx.item.data.title}</h2>
      <p>{ctx.item.data.body}</p>
    </div>
  )}
/>;
```

`ViewerItem`, `ViewerContext`, and `ImageViewerProps` are all generic over `TData`
(defaulting to `unknown`), so this is fully type-safe and entirely opt-in. Name a
`TData` and every item must carry `data`; if only some items have details, use
`ViewerItem<Detail | undefined>` and `data` is optional again.
