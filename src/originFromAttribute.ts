import type { ViewerItem } from "./types";

/** `CSS.escape`, or a minimal stand-in where it's missing (old engines, jsdom). */
function escapeAttrValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

/**
 * A ready-made `getOrigin` for tiles that carry their item's id in a data
 * attribute:
 *
 * ```tsx
 * <img data-photo-id={photo.id} … />
 * <ImageViewer getOrigin={originFromAttribute("data-photo-id")} … />
 * ```
 *
 * Returns the first element whose `attr` equals the item's id (or whatever
 * `value(item)` returns), or `null` when none is on the page, which falls back
 * to the fade. Pass `root` to search inside one container instead of the whole
 * document.
 */
export function originFromAttribute<TData = unknown>(
  attr: string,
  options: {
    value?: (item: ViewerItem<TData>) => string;
    root?: () => ParentNode | null;
  } = {},
): (index: number, item: ViewerItem<TData>) => HTMLElement | null {
  const { value = (item) => item.id, root } = options;
  return (_index, item) => {
    if (typeof document === "undefined" || !item) return null;
    const scope = root ? root() : document;
    if (!scope) return null;
    return scope.querySelector<HTMLElement>(`[${attr}="${escapeAttrValue(value(item))}"]`);
  };
}
