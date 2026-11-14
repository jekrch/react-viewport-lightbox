import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ViewerHistoryOptions, ViewerItem } from "../types";

/** Key in `history.state` that marks the viewer's own entry. */
const STATE_KEY = "__rvl";

function currentState(): Record<string, unknown> {
  const s: unknown = window.history.state;
  return s && typeof s === "object" ? { ...(s as Record<string, unknown>) } : {};
}

function urlWithParam(param: string | undefined, value: string | null): string {
  const url = new URL(window.location.href);
  if (param) {
    if (value == null) url.searchParams.delete(param);
    else url.searchParams.set(param, value);
  }
  return url.pathname + url.search + url.hash;
}

export interface ViewerHistory {
  /**
   * Hand the history entry back as a close begins: steps back off the
   * viewer's entry if it is still on top (restoring the pre-open URL), and
   * stops listening for back presses. Idempotent.
   */
  release: () => void;
}

/**
 * Gives an open viewer its own browser-history entry so the back button /
 * back gesture closes it instead of navigating the page away.
 *
 * - On mount it pushes one entry, tagged in `history.state` so it can be told
 *   apart from the page's own. With a `param`, the entry's URL names the open
 *   item; a deep-linked open (the param already in the URL) first strips it
 *   from the entry underneath, so backing out lands on a closed-viewer URL.
 * - Paging replaces the entry's URL rather than pushing, so one back press
 *   closes the viewer no matter how far the user paged.
 * - A back press calls `onBack`. Returning `true` claims it (an overlay closed
 *   instead): the entry is pushed again so the next press still lands here.
 * - Unmounting without a {@link ViewerHistory.release} (the viewer torn down
 *   by its parent) steps back off the entry too. That cleanup is deferred a
 *   tick so StrictMode's simulated unmount/remount doesn't pop it.
 */
export function useViewerHistory<TData>(
  options: boolean | ViewerHistoryOptions<TData> | undefined,
  item: ViewerItem<TData> | undefined,
  onBack: () => boolean,
): ViewerHistory {
  const enabled = !!options && typeof window !== "undefined";
  const param = typeof options === "object" ? options.param : undefined;
  const valueOf = typeof options === "object" ? options.value : undefined;
  const value = enabled && param && item ? (valueOf ? valueOf(item) : item.id) : null;

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) idRef.current = Math.random().toString(36).slice(2);
  const mountedRef = useRef(false);
  const releasedRef = useRef(false);
  const valueRef = useRef(value);
  const onBackRef = useRef(onBack);
  useLayoutEffect(() => {
    valueRef.current = value;
    onBackRef.current = onBack;
  });

  const isOurs = useCallback(() => {
    const s: unknown = window.history.state;
    return (
      !!s && typeof s === "object" && (s as Record<string, unknown>)[STATE_KEY] === idRef.current
    );
  }, []);

  const push = useCallback(() => {
    window.history.pushState(
      { ...currentState(), [STATE_KEY]: idRef.current },
      "",
      urlWithParam(param, valueRef.current),
    );
  }, [param]);

  const release = useCallback(() => {
    if (!enabled || releasedRef.current) return;
    releasedRef.current = true;
    if (isOurs()) window.history.back();
  }, [enabled, isOurs]);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    if (!isOurs() && !releasedRef.current) {
      if (param) window.history.replaceState(window.history.state, "", urlWithParam(param, null));
      push();
    }

    const onPop = () => {
      if (releasedRef.current || isOurs()) return;
      // Our entry is gone; anything the close does must not step back again.
      releasedRef.current = true;
      if (onBackRef.current()) {
        releasedRef.current = false;
        push();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current) release();
      }, 0);
    };
    // Mount-only: the entry belongs to this open. `param` is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Keep the entry's URL on the active item as the user pages.
  useEffect(() => {
    if (!enabled || !param || releasedRef.current || !isOurs()) return;
    window.history.replaceState(window.history.state, "", urlWithParam(param, value));
  }, [enabled, param, value, isOurs]);

  return { release };
}
