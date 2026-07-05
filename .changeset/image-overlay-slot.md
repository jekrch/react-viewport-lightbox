---
"@jekrch/react-viewport-lightbox": minor
---

Add a `renderImageOverlay` render slot. Its content is rendered inside the image wrapper, pinned to the active image's own box, so an absolutely-positioned child (a badge, watermark, or corner caption) tracks the letterboxed image's corners instead of floating in the surrounding dead space the way `renderOverlay` would.
