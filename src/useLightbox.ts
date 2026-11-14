import type { ComponentType } from "react";
import { ImageViewer } from "./components/ImageViewer";
import { useLightboxWith, type Lightbox, type UseLightboxOptions } from "./lightbox";
import type { ImageViewerProps, ViewerItem } from "./types";

/**
 * The whole lightbox in one call: open state, the viewer, and props for the
 * elements that open it.
 *
 * ```tsx
 * const lightbox = useLightbox(items, { loop: true });
 * // each tile: <button {...lightbox.triggerProps(i)}><img … /></button>
 * // once:      {lightbox.viewer}
 * ```
 *
 * `options` takes any `ImageViewer` prop and passes it through. The image
 * zooms out of the trigger unless you pass your own `getOrigin`. For a viewer
 * that costs nothing until it's needed, import this from `/lazy` instead.
 */
export function useLightbox<TData = unknown>(
  items: ViewerItem<TData>[],
  options?: UseLightboxOptions<TData>,
): Lightbox {
  return useLightboxWith(
    ImageViewer as ComponentType<ImageViewerProps<TData>>,
    null,
    items,
    options,
  );
}
