// Public entry point for @jekrch/react-viewport-lightbox.

export { ImageViewer } from "./components/ImageViewer";
export { NavButton } from "./components/NavButton";
export { ViewerButton, type ViewerButtonProps } from "./components/ViewerButton";
export { originFromAttribute } from "./originFromAttribute";
export { useLightbox } from "./useLightbox";
export type {
  Lightbox,
  LightboxPreload,
  LightboxTriggerHandlers,
  LightboxTriggerProps,
  UseLightboxOptions,
} from "./lightbox";
export { prefetchItem, type PrefetchOptions, type PrefetchPriority } from "./prefetch";
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
  useViewerHistory,
  useSwipeDismiss,
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
  ViewerHistory,
  SwipeDismissHandlers,
  SwipeDismissState,
  SwipeDismissArgs,
  Dims,
  Insets,
  SlideAction,
  ResolveSlideArgs,
} from "./hooks";

export type {
  ViewerItem,
  ViewerItemBase,
  ViewerContext,
  ViewerIcons,
  ViewerSlot,
  ViewerRect,
  ViewerStageShift,
  ViewerHistoryOptions,
  ImageViewerProps,
} from "./types";
