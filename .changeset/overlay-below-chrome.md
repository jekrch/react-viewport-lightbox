---
"@jekrch/react-viewport-lightbox": patch
---

Fix `renderOverlay` layering: the overlay slot now sits above the image but
below the top/bottom bars (`z-index: 15` instead of `25`). Previously a drawer
or graph rendered via `renderOverlay` painted over the chrome, so sliding one up
from the bottom covered the nav controls, counter, and edge-slot buttons. The
overlay is documented as "layered over the image" — the chrome now stays visible
and on top, even while an overlay animates in.
