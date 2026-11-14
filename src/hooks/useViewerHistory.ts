import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ViewerHistoryOptions, ViewerItem } from "../types";

/** Key in `history.state` that marks the viewer's own entries. */
const STATE_KEY = "__rvl";
/** The id of the item an entry shows (`paging: "push"` steps between these). */
const ITEM_KEY = "__rvlItem";
/** How many viewer entries sit below this one (0 = the entry pushed on open). */
const DEPTH_KEY = "__rvlDepth";

function currentState(): Record<string, unknown> {
  const s: unknown = window.history.state;
  return s && typeof s === "object" ? { ...(s as Record<string, unknown>) } : {};
}

/**
 * Run a history write, reporting whether the browser allowed it. A sandboxed
 * frame (an opaque origin: CodeSandbox embeds, Storybook, srcdoc) can refuse
 * to rewrite the URL with a SecurityError; the viewer must keep working.
 */
function tryHistory(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the page has had a user interaction (sticky activation). Browsers
 * skip a history entry pushed before any interaction when the user presses
 * back (Chrome's history manipulation intervention; Safari and Firefox have
 * similar rules), so an entry pushed on a cold deep-linked open would be
 * jumped over. Without the API, assume the page has been interacted with.
 */
function hasBeenActive(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return activation ? activation.hasBeenActive : true;
}

// The events that can give a page its first user activation (keydown covers
// keys other than Escape; a touch activates on release, not on press).
const ACTIVATION_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;

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
   * Hand the history entries back as a close begins: steps back off every
   * viewer entry still on the stack (restoring the pre-open URL), and stops
   * listening for back presses. Idempotent.
   *
   * `then` runs once the viewer is off the stack: when its back step has
   * landed, or at once if there was nothing to step off. Navigate from there,
   * not in the same tick: a URL you push before the step lands is the entry
   * the step goes back from, which leaves the viewer's entry behind it.
   */
  release: (then?: () => void) => void;
}

/** How long a release waits for its back step to report before giving up on it. */
const RELEASE_TIMEOUT_MS = 1000;

/**
 * Gives an open viewer its own browser-history entry so the back button /
 * back gesture closes it instead of navigating the page away.
 *
 * - On mount it pushes one entry, tagged in `history.state` so it can be told
 *   apart from the page's own. With a `param`, the entry's URL names the open
 *   item; a deep-linked open (the param already in the URL) first strips it
 *   from the entry underneath, so backing out lands on a closed-viewer URL.
 * - Paging replaces the entry's URL rather than pushing, so one back press
 *   closes the viewer no matter how far the user paged. With
 *   `paging: "push"`, each item gets its own entry instead: back and forward
 *   land on them and call `onStep(itemId)` to show that item.
 * - A back press off the viewer's entries calls `onBack`. Returning `true`
 *   claims it (an overlay closed instead): the entry is pushed again so the
 *   next press still lands here. `onStep` returning `false` claims a step the
 *   same way.
 * - Opened before the user has interacted with the page (a cold deep link, a
 *   reload while open), the push waits for the first click, tap, or key, so
 *   the back button doesn't skip the entry. Closed before that, the viewer
 *   just strips its param from the URL.
 * - Unmounting without a {@link ViewerHistory.release} (the viewer torn down
 *   by its parent) steps back off the entries too. That cleanup is deferred a
 *   tick so StrictMode's simulated unmount/remount doesn't pop it.
 */
export function useViewerHistory<TData>(
  options: boolean | ViewerHistoryOptions<TData> | undefined,
  item: ViewerItem<TData> | undefined,
  onBack: () => boolean,
  onStep?: (itemId: string) => boolean,
): ViewerHistory {
  const enabled = !!options && typeof window !== "undefined";
  const param = typeof options === "object" ? options.param : undefined;
  const valueOf = typeof options === "object" ? options.value : undefined;
  const pushPaging = typeof options === "object" && options.paging === "push";
  const value = enabled && param && item ? (valueOf ? valueOf(item) : item.id) : null;
  const itemId = item?.id;

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) idRef.current = Math.random().toString(36).slice(2);
  const mountedRef = useRef(false);
  const releasedRef = useRef(false);
  // Callbacks waiting for a release's back step to land.
  const waitingRef = useRef<(() => void)[] | null>(null);
  const valueRef = useRef(value);
  const itemIdRef = useRef(itemId);
  const onBackRef = useRef(onBack);
  const onStepRef = useRef(onStep);
  useLayoutEffect(() => {
    valueRef.current = value;
    itemIdRef.current = itemId;
    onBackRef.current = onBack;
    onStepRef.current = onStep;
  });

  /** The current entry's state when it is one of this viewer's, else null. */
  const ours = useCallback((): Record<string, unknown> | null => {
    const s: unknown = window.history.state;
    return !!s &&
      typeof s === "object" &&
      (s as Record<string, unknown>)[STATE_KEY] === idRef.current
      ? (s as Record<string, unknown>)
      : null;
  }, []);

  // Pushes a viewer entry for the current item, `depth` entries above the
  // first. If the URL can't be rewritten, falls back to a state-only entry
  // (back still works; the URL just doesn't name the item). Returns false
  // when the browser refuses history writes altogether.
  const push = useCallback(
    (depth: number) => {
      const state = {
        ...currentState(),
        [STATE_KEY]: idRef.current,
        [ITEM_KEY]: itemIdRef.current,
        [DEPTH_KEY]: depth,
      };
      return (
        tryHistory(() =>
          window.history.pushState(state, "", urlWithParam(param, valueRef.current)),
        ) || tryHistory(() => window.history.pushState(state, ""))
      );
    },
    [param],
  );

  const stripParam = useCallback(() => {
    if (!param) return;
    tryHistory(() =>
      window.history.replaceState(window.history.state, "", urlWithParam(param, null)),
    );
  }, [param]);

  const release = useCallback(
    (then?: () => void) => {
      // A step already on its way: join it.
      if (waitingRef.current) {
        if (then) waitingRef.current.push(then);
        return;
      }
      if (!enabled || releasedRef.current) {
        then?.();
        return;
      }
      releasedRef.current = true;
      const state = ours();
      // Never pushed (closed before any interaction): leave a closed-viewer URL.
      if (!state) {
        stripParam();
        then?.();
        return;
      }
      // Step off every viewer entry at once, back to the page the viewer opened on.
      const waiting = (waitingRef.current = then ? [then] : []);
      const landed = () => {
        window.removeEventListener("popstate", landed);
        clearTimeout(timer);
        waitingRef.current = null;
        waiting.forEach((fn) => fn());
      };
      window.addEventListener("popstate", landed);
      const timer = setTimeout(landed, RELEASE_TIMEOUT_MS);
      const depth = Number(state[DEPTH_KEY]) || 0;
      if (depth > 0) window.history.go(-depth - 1);
      else window.history.back();
    },
    [enabled, ours, stripParam],
  );

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    // Strip a deep-linked param from the entry underneath, then push ours.
    // No entry could be pushed: behave as if `history` were off.
    const arm = () => {
      stripParam();
      if (!push(0)) releasedRef.current = true;
    };
    let stopWaiting = () => {};
    if (!ours() && !releasedRef.current) {
      if (hasBeenActive()) {
        arm();
      } else {
        const onInteract = () => {
          if (!hasBeenActive()) return;
          stopWaiting();
          if (mountedRef.current && !releasedRef.current && !ours()) arm();
        };
        for (const type of ACTIVATION_EVENTS) {
          window.addEventListener(type, onInteract, { capture: true });
        }
        stopWaiting = () => {
          for (const type of ACTIVATION_EVENTS) {
            window.removeEventListener(type, onInteract, { capture: true });
          }
        };
      }
    }

    const onPop = () => {
      if (releasedRef.current) return;
      const state = ours();
      if (state) {
        // Back/forward between the viewer's own entries (`paging: "push"`).
        const target = state[ITEM_KEY];
        if (!pushPaging || typeof target !== "string" || target === itemIdRef.current) return;
        // Claimed (an overlay closed instead): put the item we left back on top.
        if (onStepRef.current?.(target) === false) push((Number(state[DEPTH_KEY]) || 0) + 1);
        return;
      }
      // Off the viewer's entries; anything the close does must not step back again.
      releasedRef.current = true;
      if (onBackRef.current() && push(0)) releasedRef.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      stopWaiting();
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current) release();
      }, 0);
    };
    // Mount-only: the entries belong to this open. The options are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Follow the active item as the user pages: a new entry per item with
  // `paging: "push"` (unless this item's entry is already current, i.e. a
  // back/forward step brought us here), else rewrite the one entry's URL.
  useEffect(() => {
    if (!enabled || releasedRef.current) return;
    const state = ours();
    if (!state) return;
    if (pushPaging) {
      if (state[ITEM_KEY] !== itemId) push((Number(state[DEPTH_KEY]) || 0) + 1);
      return;
    }
    if (!param) return;
    tryHistory(() =>
      window.history.replaceState(window.history.state, "", urlWithParam(param, value)),
    );
  }, [enabled, param, value, itemId, pushPaging, ours, push]);

  return { release };
}
