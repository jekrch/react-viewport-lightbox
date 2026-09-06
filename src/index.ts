// Public entry point for @jekrch/react-viewport-lightbox.

export { ImageViewer } from "./components/ImageViewer";
export { NavButton } from "./components/NavButton";
export {
  defaultIcons,
  CloseIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "./components/icons";

export {
  useImageZoomPan,
  MIN_SCALE,
  MAX_SCALE,
  useSlideNavigation,
  useGestureHandler,
  useBarMeasure,
  useBodyScrollLock,
  clampTranslate,
  resolveSlideDirection,
  coverRect,
  cropInsets,
  cropsAnything,
  cropFeather,
  cropMask,
  cropFadeProgress,
  parseObjectPosition,
} from "./hooks";

export { useFocusTrap } from "./hooks/useFocusTrap";

export type {
  ImageZoomPanState,
  ImageTransform,
  SlideNavigationState,
  Dims,
  Insets,
  SlideAction,
  ResolveSlideArgs,
} from "./hooks";

export type {
  ViewerItem,
  ViewerContext,
  ViewerIcons,
  ViewerSlot,
  ViewerRect,
  ImageViewerProps,
} from "./types";
