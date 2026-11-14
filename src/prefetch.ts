import type { ViewerItem } from "./types";

export type PrefetchPriority = "high" | "low" | "auto";

export interface PrefetchOptions {
  /**
   * Fetch priority hint (`fetchPriority`). Default `"high"`: a hovered or
   * pressed tile is the image most likely to be opened next.
   */
  priority?: PrefetchPriority;
}

type PrefetchSource = Pick<ViewerItem, "src" | "srcSet" | "sizes">;

// One request per source, shared by every caller: a tile hover, the viewer's
// neighbor warm, and the thumbnail-first open all land here, so an image
// already in flight is never requested twice. Each entry holds its Image until
// it settles so an in-flight fetch isn't dropped by GC.
const inflight = new Map<string, Promise<boolean>>();

// srcset/sizes are part of the key: the same `src` with a different srcset can
// resolve to a different candidate.
const keyOf = (item: PrefetchSource) =>
  item.srcSet ? `${item.src}\n${item.srcSet}\n${item.sizes ?? ""}` : item.src;

/**
 * Start fetching and decoding an item's full image ahead of time, e.g. on a
 * tile's `pointerenter` / `pointerdown`, so the viewer opens on a warm cache.
 * Mirrors `srcSet`/`sizes` so the browser picks the candidate the viewer's
 * `<img>` will. Repeat calls for the same source share one request.
 *
 * Resolves `true` once decoded, `false` on failure (a failed source can be
 * retried) or during SSR.
 */
export function prefetchItem(
  item: PrefetchSource,
  { priority = "high" }: PrefetchOptions = {},
): Promise<boolean> {
  if (typeof window === "undefined" || !item.src) return Promise.resolve(false);
  const key = keyOf(item);
  const existing = inflight.get(key);
  if (existing) return existing;

  const img = new Image();
  if ("fetchPriority" in img) img.fetchPriority = priority;
  if (item.srcSet) {
    img.srcset = item.srcSet;
    if (item.sizes) img.sizes = item.sizes;
  }
  img.src = item.src;

  const promise = new Promise<boolean>((resolve) => {
    const settle = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      if (!ok) inflight.delete(key);
      resolve(ok);
    };
    if (typeof img.decode === "function") {
      img.decode().then(
        () => settle(true),
        () => settle(false),
      );
    } else {
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
    }
  });
  inflight.set(key, promise);
  return promise;
}

/** @internal Clears the shared request cache. Tests only. */
export function resetPrefetchCache() {
  inflight.clear();
}

/** The user asked for reduced data use (`Save-Data`, Chromium only). */
export function prefersSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}
