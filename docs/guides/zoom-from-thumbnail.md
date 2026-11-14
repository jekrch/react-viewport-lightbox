# Zoom from thumbnail

[← README](../../README.md) · [All guides](README.md)

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

## Thumbnail-first open

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

## Cropped thumbnails

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
