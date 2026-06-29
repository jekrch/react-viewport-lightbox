import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { type MouseEvent } from "react";
import { useImageZoomPan } from "./useImageZoomPan";

function makeWrapperRef() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return { current: el };
}

const doubleClick = { stopPropagation: () => {} } as unknown as MouseEvent;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useImageZoomPan", () => {
  it("starts unzoomed", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    expect(result.current.displayScale).toBe(1);
    expect(result.current.isZoomed).toBe(false);
  });

  it("setTransform applies the scale to the wrapper and marks it zoomed", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));

    act(() => result.current.setTransform({ scale: 2, x: 0, y: 0 }));

    expect(result.current.displayScale).toBe(2);
    expect(result.current.isZoomed).toBe(true);
    expect(ref.current.style.transform).toContain("scale(2)");
  });

  it("resetTransform returns to the unzoomed state", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));

    act(() => result.current.setTransform({ scale: 3, x: 10, y: 10 }));
    act(() => result.current.resetTransform());

    expect(result.current.displayScale).toBe(1);
    expect(result.current.isZoomed).toBe(false);
    expect(ref.current.style.transform).toBe("none");
  });

  it("double-click toggles zoom in and back out", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));

    act(() => result.current.handleDoubleClick(doubleClick));
    expect(result.current.isZoomed).toBe(true);
    expect(result.current.displayScale).toBeCloseTo(1.8);

    act(() => result.current.handleDoubleClick(doubleClick));
    expect(result.current.isZoomed).toBe(false);
  });

  it("ignores double-click when zoom is disabled", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, false));

    act(() => result.current.handleDoubleClick(doubleClick));
    expect(result.current.isZoomed).toBe(false);
  });

  it("clampTranslate pins to the origin when not zoomed", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    expect(result.current.clampTranslate(100, 100, 1)).toEqual({ x: 0, y: 0 });
  });

  it("wheel-up zooms in when enabled", () => {
    // The wheel listener attaches on mount, so the element must exist up front.
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ref = { current: el };
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));

    act(() => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    });
    expect(result.current.displayScale).toBeGreaterThan(1);
  });

  it("does not wheel-zoom when disabled", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ref = { current: el };
    const { result } = renderHook(() => useImageZoomPan(ref, 0, false));

    act(() => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    });
    expect(result.current.displayScale).toBe(1);
  });
});
