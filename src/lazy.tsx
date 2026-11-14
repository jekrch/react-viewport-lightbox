import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import type { ImageViewerProps, ViewerItem } from "./types";
import { useLightboxWith, type Lightbox, type UseLightboxOptions } from "./lightbox";

// `@jekrch/react-viewport-lightbox/lazy`: the viewer's code moves into its own
// chunk, loaded on first open (or earlier, via preloadViewer). Everything this
// entry imports statically must stay tiny: it ships in the consumer's main
// bundle. Types are free; only these runtime imports count.
export { prefetchItem, type PrefetchOptions, type PrefetchPriority } from "./prefetch";
export { originFromAttribute } from "./originFromAttribute";
export type {
  Lightbox,
  LightboxPreload,
  LightboxTriggerHandlers,
  LightboxTriggerProps,
  UseLightboxOptions,
} from "./lightbox";
// Slot building blocks: tiny, and a lazy gallery shouldn't have to reach into
// the main entry (pulling the viewer back in) to put a button in a slot.
export { ViewerButton, type ViewerButtonProps } from "./components/ViewerButton";
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

let viewerChunk: Promise<typeof import("./components/ImageViewer")> | undefined;

function loadViewer() {
  viewerChunk ??= import("./components/ImageViewer").catch((error: unknown) => {
    // Let a later call retry a chunk that failed to load (e.g. offline).
    viewerChunk = undefined;
    throw error;
  });
  return viewerChunk;
}

/**
 * Start loading the viewer's code without rendering it, so the first open
 * doesn't wait on a chunk download. Call it when an open becomes likely: on
 * idle after the gallery renders, or on a tile's `pointerenter` /
 * `pointerdown`. Safe to call repeatedly. Resolves once the code is loaded.
 */
export function preloadViewer(): Promise<void> {
  return loadViewer().then(() => undefined);
}

const LazyViewer = lazy(() =>
  loadViewer().then((m) => ({
    default: m.ImageViewer as ComponentType<ImageViewerProps<unknown>>,
  })),
);

export interface LazyImageViewerProps<TData = unknown> extends ImageViewerProps<TData> {
  /**
   * Rendered while the viewer's code loads, which only happens on an open
   * that {@link preloadViewer} didn't get ahead of. Default: nothing.
   */
  fallback?: ReactNode;
}

/**
 * `<ImageViewer>` with its code split into a separate chunk. Same props, plus
 * `fallback`. Mount it the way you'd mount `ImageViewer` (only while open), and
 * call {@link preloadViewer} ahead of the first open.
 */
export function LazyImageViewer<TData = unknown>({
  fallback = null,
  ...props
}: LazyImageViewerProps<TData>) {
  return (
    <Suspense fallback={fallback}>
      <LazyViewer {...(props as ImageViewerProps<unknown>)} />
    </Suspense>
  );
}

/**
 * The whole lightbox in one call, with the viewer's code split out: open
 * state, the viewer, and props for the elements that open it. Loads the code
 * on idle and each photo on hover/press (see `preload`).
 *
 * ```tsx
 * const lightbox = useLightbox(items, { loop: true });
 * // each tile: <button {...lightbox.triggerProps(i)}><img … /></button>
 * // once:      {lightbox.viewer}
 * ```
 *
 * `options` takes any `LazyImageViewer` prop (so `fallback` too) and passes it
 * through. The image zooms out of the trigger unless you pass your own
 * `getOrigin`.
 */
export function useLightbox<TData = unknown>(
  items: ViewerItem<TData>[],
  options?: UseLightboxOptions<TData> & Pick<LazyImageViewerProps<TData>, "fallback">,
): Lightbox {
  return useLightboxWith(
    LazyImageViewer as ComponentType<ImageViewerProps<TData>>,
    preloadViewer,
    items,
    options,
  );
}
