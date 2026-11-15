# Loading fast

[← README](../../README.md) · [All guides](README.md)

The viewer is mounted only while open, so it can stay out of your page's main
bundle until someone opens an image. `useLightbox` from the `/lazy` entry does
all of this for you. Without the hook, the same pieces are exported:

```tsx
import { useState } from "react";
import {
  LazyImageViewer,
  preloadViewer,
  prefetchItem,
  type ViewerItem,
} from "@jekrch/react-viewport-lightbox/lazy";
import "@jekrch/react-viewport-lightbox/styles.css";

export function Gallery({ items }: { items: ViewerItem[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  return (
    <>
      {items.map((item, i) => (
        <img
          key={item.id}
          src={item.thumbnail}
          alt={item.alt}
          // Get the viewer's code and this image's full source moving before the click.
          onPointerEnter={() => {
            preloadViewer();
            prefetchItem(item);
          }}
          onPointerDown={() => prefetchItem(item)}
          onClick={() => {
            setIndex(i);
            setOpen(true);
          }}
        />
      ))}
      {open && (
        <LazyImageViewer
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

- **`LazyImageViewer`** takes the same props as `ImageViewer`, plus `fallback`
  (shown while the code loads; default nothing). Used this way, the `/lazy`
  entry adds about 0.5 KB gzip to your main bundle (about 1.1 KB with
  `useLightbox`); the rest (~17 KB) arrives as a separate chunk.
- **`preloadViewer()`** starts loading that chunk. Call it before the first
  open, on tile hover as above or on idle once the gallery has rendered
  (`requestIdleCallback(preloadViewer)`). If nothing preloads it, the first open
  waits on the chunk download.
- **`prefetchItem(item, { priority? })`** fetches and decodes an item's full
  image (mirroring `srcSet`/`sizes`) so the open starts from a warm cache. Hover
  usually comes a few hundred milliseconds before the click; `pointerdown` covers
  touch. Repeat calls share one request while it's in flight and for a few
  seconds after, and the viewer's own warming and thumbnail-first open reuse
  it. Later calls decode again (from the HTTP cache), since phones drop decoded
  images under memory pressure. Also exported from the main entry.

The `/lazy` entry re-exports `originFromAttribute` and the types, so a lazy
gallery doesn't need the main entry. Importing `ImageViewer` (or the hooks) from
the main entry puts the viewer back in your main bundle; type-only imports from
either entry are free.

## Sharp zoom without big opens

`srcSet` lets a phone open a small candidate, which would leave a 3× zoom
blurry. The viewer handles that: once a zoom past 1.5× settles, it decodes the
`srcSet` candidate the zoomed width calls for and swaps it in. The swap waits
for the decode, so the image never blanks, and zooming back out keeps the sharp
source. Nothing is fetched for a zoom that never happens.

Without a `srcSet`, give an item a `zoomSrc` (your original, say) and it is
fetched the same way, on the first zoom past 1.5×:

```ts
{ id: "1", src: "/photos/1-1600.jpg", zoomSrc: "/photos/1-original.jpg" }
```

`zoomSrc` wins over the `srcSet` when an item has both.
