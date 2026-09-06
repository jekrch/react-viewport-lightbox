import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useViewportHeight, VIEWPORT_H_FALLBACK } from "./useViewportHeight";

let observers: Array<{ cb: ResizeObserverCallback; el: Element | null }> = [];

beforeEach(() => {
  observers = [];
  window.ResizeObserver = class {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
      observers.push({ cb, el: null });
    }
    observe(el: Element) {
      const entry = observers.find((o) => o.cb === this.cb);
      if (entry) entry.el = el;
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Renders the hook against a real div whose measured height is `height`. */
function renderWithHeight(height: number) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const rect = vi.fn(() => ({ height }) as DOMRect);
  el.getBoundingClientRect = rect as unknown as () => DOMRect;
  const view = renderHook(() => {
    const ref = useRef<HTMLElement | null>(el);
    return useViewportHeight(ref);
  });
  return { el, view, setHeight: (h: number) => (height = h) };
}

describe("useViewportHeight", () => {
  it("falls back to a viewport unit when the element measures 0 (jsdom/SSR)", () => {
    const { view } = renderWithHeight(0);
    expect(view.result.current).toBe(VIEWPORT_H_FALLBACK);
  });

  it("reports the measured root height in px", () => {
    const { view } = renderWithHeight(812);
    expect(view.result.current).toBe("812px");
  });

  it("tracks resizes of the root through the ResizeObserver", () => {
    const { view, setHeight } = renderWithHeight(812);
    expect(view.result.current).toBe("812px");

    setHeight(736);
    act(() => {
      observers.forEach((o) => o.cb([], {} as ResizeObserver));
    });
    expect(view.result.current).toBe("736px");
  });

  it("ignores sub-pixel churn so an observer callback doesn't re-render for nothing", () => {
    const { view, setHeight } = renderWithHeight(812);
    const first = view.result.current;

    setHeight(812.2);
    act(() => {
      observers.forEach((o) => o.cb([], {} as ResizeObserver));
    });
    expect(view.result.current).toBe(first);
  });

  it("still measures once when ResizeObserver is unavailable", () => {
    // @ts-expect-error deliberately removing the global for this case
    delete window.ResizeObserver;
    const { view } = renderWithHeight(600);
    expect(view.result.current).toBe("600px");
  });
});
