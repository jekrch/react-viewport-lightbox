import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ComponentType,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { ImageViewerProps, ViewerItem } from "./types";
import { prefetchItem } from "./prefetch";

// The shared core of `useLightbox`. It never imports the viewer: each entry
// hands it its own (the eager `ImageViewer` from the main entry, the
// code-split one from `/lazy`), so `/lazy` stays small.

/**
 * When to start loading ahead of an open. `"idle"` (default): the viewer's
 * code once the page is idle, and each photo when its trigger is hovered or
 * pressed. `"intent"`: only on hover/press. `false`: nothing ahead of time.
 */
export type LightboxPreload = "idle" | "intent" | false;

export interface UseLightboxOptions<TData = unknown> extends Omit<
  ImageViewerProps<TData>,
  "items" | "index" | "onIndexChange" | "onClose"
> {
  /** Also called when the viewer pages. The hook keeps the index itself. */
  onIndexChange?: (index: number) => void;
  /** Also called once the viewer has closed. */
  onClose?: () => void;
  /** See {@link LightboxPreload}. Default `"idle"`. */
  preload?: LightboxPreload;
}

/** Your own handlers for a trigger, run before the lightbox's. */
export interface LightboxTriggerHandlers {
  /** Call `e.preventDefault()` to keep the viewer from opening. */
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
}

/** Props to spread on the element that opens an item: a tile, a link, a card. */
export interface LightboxTriggerProps extends Required<LightboxTriggerHandlers> {
  /** Marks the element the image zooms out of, and back into. */
  "data-rvl-trigger": string;
}

export interface Lightbox {
  isOpen: boolean;
  /** The item open, or last open. */
  index: number;
  /** Open on `index`. */
  open: (index: number) => void;
  /**
   * Unmount the viewer at once, with no exit animation (for a route change,
   * say). The viewer's own controls, and `ctx.close()` in a slot, animate.
   */
  close: () => void;
  /**
   * Props for the element that opens item `index`: open on click, preload on
   * hover/press, and mark it as the zoom origin. Pass your own handlers as
   * `handlers` rather than after the spread, so both run.
   */
  triggerProps: (index: number, handlers?: LightboxTriggerHandlers) => LightboxTriggerProps;
  /** Render this once, anywhere: the viewer while open, else `null`. */
  viewer: ReactNode;
}

/** @internal Each entry's `useLightbox` calls this with its own viewer. */
export function useLightboxWith<TData>(
  Viewer: ComponentType<ImageViewerProps<TData>>,
  preloadViewer: (() => unknown) | null,
  items: ViewerItem<TData>[],
  options: UseLightboxOptions<TData> = {},
): Lightbox {
  const { preload = "idle", onIndexChange, onClose, getOrigin, ...rest } = options;
  const [isOpen, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const uid = useId();

  const open = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  // Fetch the viewer's code once the page is idle, so even an open with no
  // hover first (a tap on a phone) rarely waits on it. Not cancelled on
  // unmount: the load is shared and harmless to finish.
  useEffect(() => {
    if (preload === "idle" && preloadViewer)
      (window.requestIdleCallback ?? setTimeout)(() => void preloadViewer());
  }, [preload, preloadViewer]);

  // A deep link (`?photo=<id>` with `history: { param: "photo" }`) opens on
  // its item. After mount, so a server render and the first client render match.
  const { history } = rest;
  useEffect(() => {
    if (typeof history !== "object" || !history.param) return;
    const wanted = new URLSearchParams(location.search).get(history.param);
    const valueOf = history.value ?? ((item: ViewerItem<TData>) => item.id);
    const i = items.findIndex((item) => valueOf(item) === wanted);
    if (i >= 0) open(i);
    // Mount only: this reads the URL the page was loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the viewer calls this, in the browser.
  const ownOrigin = useCallback(
    (i: number) => document.querySelector<HTMLElement>(`[data-rvl-trigger="${uid}${i}"]`),
    [uid],
  );

  const triggerProps = useCallback(
    (i: number, handlers: LightboxTriggerHandlers = {}): LightboxTriggerProps => {
      // Hover and press both come before the click: start the code and the
      // photo then. Both are deduped, so repeats cost nothing.
      const warm = (
        e: PointerEvent<HTMLElement>,
        yours?: (e: PointerEvent<HTMLElement>) => void,
      ) => {
        yours?.(e);
        if (preload === false) return;
        preloadViewer?.();
        if (items[i]) void prefetchItem(items[i]);
      };
      return {
        "data-rvl-trigger": uid + i,
        onPointerEnter: (e) => warm(e, handlers.onPointerEnter),
        onPointerDown: (e) => warm(e, handlers.onPointerDown),
        onClick: (e) => {
          handlers.onClick?.(e);
          // Leave a modified click (new tab or window, on a link) to the browser.
          if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
            return;
          e.preventDefault();
          open(i);
        },
      };
    },
    [uid, items, preload, preloadViewer, open],
  );

  const current = Math.min(index, items.length - 1);
  const viewer =
    isOpen && current >= 0 ? (
      <Viewer
        {...rest}
        items={items}
        index={current}
        getOrigin={getOrigin ?? ownOrigin}
        onIndexChange={(i) => {
          setIndex(i);
          onIndexChange?.(i);
        }}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      />
    ) : null;

  return { isOpen, index, open, close, triggerProps, viewer };
}
