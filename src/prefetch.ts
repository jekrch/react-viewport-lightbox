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
//
// A finished source is only remembered briefly. Browsers (iOS Safari above
// all) throw decoded images away under memory pressure, so "decoded once" says
// nothing about a later open: a repeat call after FRESH_MS decodes again (the
// bytes come from the HTTP cache).
const inflight = new Map<string, { img: HTMLImageElement; done: Promise<boolean> }>();
const FRESH_MS = 10_000;

// srcset/sizes are part of the key: the same `src` with a different srcset can
// resolve to a different candidate.
const keyOf = (item: PrefetchSource) =>
  item.srcSet ? `${item.src}\n${item.srcSet}\n${item.sizes ?? ""}` : item.src;

/**
 * @internal {@link prefetchItem}, also handing back the off-DOM image, so a
 * caller can keep it referenced while the image matters (WebKit is slower to
 * purge the decoded data of an image something still holds).
 */
export function warmImage(
  item: PrefetchSource,
  { priority = "high" }: PrefetchOptions = {},
): { img: HTMLImageElement; done: Promise<boolean> } | null {
  if (typeof window === "undefined" || !item.src) return null;
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

  const done = new Promise<boolean>((resolve) => {
    const settle = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      // A failure can be retried at once; a success is shared for a while.
      if (!ok) forget();
      else setTimeout(forget, FRESH_MS);
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
  const entry = { img, done };
  const forget = () => {
    if (inflight.get(key) === entry) inflight.delete(key);
  };
  inflight.set(key, entry);
  return entry;
}

/**
 * Start fetching and decoding an item's full image ahead of time, e.g. on a
 * tile's `pointerenter` / `pointerdown`, so the viewer opens on a warm cache.
 * Mirrors `srcSet`/`sizes` so the browser picks the candidate the viewer's
 * `<img>` will. Repeat calls for the same source share one request while it's
 * in flight and for a short while after.
 *
 * Resolves `true` once decoded, `false` on failure (a failed source can be
 * retried) or during SSR.
 */
export function prefetchItem(item: PrefetchSource, options?: PrefetchOptions): Promise<boolean> {
  return warmImage(item, options)?.done ?? Promise.resolve(false);
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
