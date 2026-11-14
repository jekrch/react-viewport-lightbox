/**
 * The built-in `hint` line text. Pure so the matrix is easy to test: it names
 * only the gestures that will actually work in the current state.
 */
export function defaultHintText({
  isTouchDevice,
  multiple,
  navigation,
  zoom,
  dismiss = false,
}: {
  isTouchDevice: boolean;
  /** More than one item is reachable (hasPrev || hasNext). */
  multiple: boolean;
  /** Swipe/arrow navigation is live (not `disableNavigation`). */
  navigation: boolean;
  zoom: boolean;
  /** Swipe-to-close is on (named on touch only; desktop says esc). */
  dismiss?: boolean;
}): string | null {
  const parts: string[] = [];
  if (multiple && navigation) {
    parts.push(isTouchDevice ? "swipe to navigate" : "← → or drag to navigate");
  }
  if (zoom) {
    parts.push(isTouchDevice ? "pinch to zoom" : "scroll to zoom");
    // A single image has room for the double-tap/click shortcut too; with
    // navigation in the line it would run long on a phone.
    if (!multiple) parts.push(isTouchDevice ? "double-tap to enlarge" : "double-click to enlarge");
  }
  if (!isTouchDevice) parts.push("esc to close");
  else if (dismiss) parts.push("swipe down to close");
  return parts.length ? parts.join(" · ") : null;
}
