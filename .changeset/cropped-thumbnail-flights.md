---
"@jekrch/react-viewport-lightbox": minor
---

Handle cropped thumbnails in the shared-element zoom.

A `getOrigin` element whose image is laid out with `object-fit: cover` shows a
slice of that image, and the transition now treats it as one. The flight targets
the rect the whole image would occupy at the crop's own scale instead of the
element's literal box — so it no longer squashes the picture for the length of
the animation, hardest on exactly the images the crop works hardest on — and the
parts the thumbnail has no room for fade in and out across the flight rather
than appearing and vanishing in a single frame at the hand-off.
`object-position` is honored, so an off-centre crop lines up too.

This changes the transition for consumers whose thumbnails crop; it needs no
code change to pick up, and `thumbnailCrop={false}` restores the old behavior.

Also exports the geometry behind it — `coverRect`, `cropInsets`, `cropMask`,
`cropFeather`, `cropFadeProgress`, `cropsAnything`, `parseObjectPosition`, and
the `Insets` type.
