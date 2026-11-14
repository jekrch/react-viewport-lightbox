/** Parse a CSS time (`"300ms"`, `"0.3s"`) to milliseconds; null when it isn't one. */
export function parseCssTime(raw: string): number | null {
  const v = raw.trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (v.endsWith("ms")) return n;
  if (v.endsWith("s")) return n * 1000;
  return null;
}

/**
 * A duration custom property (e.g. `--rvl-backdrop-out`) as seen from `el`, in
 * ms, so a consumer's override on any ancestor is honored. `fallback` when
 * there's no element, no stylesheet, or no parseable value.
 */
export function cssDurationMs(el: Element | null, name: string, fallback: number): number {
  if (!el || typeof window === "undefined") return fallback;
  return parseCssTime(window.getComputedStyle(el).getPropertyValue(name)) ?? fallback;
}
