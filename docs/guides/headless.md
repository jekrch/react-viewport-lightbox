# Headless usage

[← README](../../README.md) · [All guides](README.md)

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
