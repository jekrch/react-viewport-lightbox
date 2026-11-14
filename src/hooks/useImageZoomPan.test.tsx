import { afterEach, describe, expect, it, vi } from "vitest";
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

  it('wheel="zoom" zooms on a plain wheel', () => {
    // The wheel listener attaches on mount, so the element must exist up front.
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true, true, "zoom"));

    const e = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
    act(() => {
      ref.current.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.displayScale).toBeGreaterThan(1);
  });

  it("leaves a plain wheel on an unzoomed image to the browser", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));

    const e = new WheelEvent("wheel", { deltaX: -40, deltaY: -100, cancelable: true });
    act(() => {
      ref.current.dispatchEvent(e);
    });
    // Not prevented, so a trackpad's two-finger swipe-back still works.
    expect(e.defaultPrevented).toBe(false);
    expect(result.current.transformRef.current.scale).toBe(1);
  });

  it("zooms on a trackpad pinch (ctrlKey wheel)", () => {
    vi.useFakeTimers();
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));

    const e = new WheelEvent("wheel", { deltaY: -10, ctrlKey: true, cancelable: true });
    act(() => {
      ref.current.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.transformRef.current.scale).toBeCloseTo(Math.exp(0.1));
    // The readout syncs once the pinch's event stream goes quiet.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.displayScale).toBeCloseTo(Math.exp(0.1));
    vi.useRealTimers();
  });

  it("pans a zoomed image on a plain wheel, clamped to its edges", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    // jsdom's window is 1024x768; at 2x an 800x600 image can pan ±288 / ±216.
    result.current.baseDimsRef.current = { width: 800, height: 600 };
    act(() => result.current.setTransform({ scale: 2, x: 0, y: 0 }));

    const e = new WheelEvent("wheel", { deltaX: 50, deltaY: 30, cancelable: true });
    act(() => {
      ref.current.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.transformRef.current).toEqual({ scale: 2, x: -50, y: -30 });

    act(() => {
      ref.current.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000, cancelable: true }));
    });
    expect(result.current.transformRef.current).toEqual({ scale: 2, x: -50, y: -216 });
  });

  it("shift+wheel pans sideways", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    result.current.baseDimsRef.current = { width: 800, height: 600 };
    act(() => result.current.setTransform({ scale: 2, x: 0, y: 0 }));

    act(() => {
      ref.current.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 40, shiftKey: true, cancelable: true }),
      );
    });
    expect(result.current.transformRef.current).toEqual({ scale: 2, x: -40, y: 0 });
  });

  it("momentum glides a released pan, decays, and stops at the edge", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    result.current.baseDimsRef.current = { width: 800, height: 600 };
    act(() => result.current.setTransform({ scale: 2, x: 0, y: 0 }));

    act(() => result.current.startMomentum(1, 0.1));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const mid = result.current.transformRef.current;
    expect(mid.x).toBeGreaterThan(30);
    expect(mid.x).toBeLessThan(100);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const end = result.current.transformRef.current;
    // 1 px/ms with a 325 ms time constant coasts ~325 px: the x edge (288)
    // stops it; y coasts its own ~32 px.
    expect(end.x).toBe(288);
    expect(end.y).toBeGreaterThan(20);
    expect(end.y).toBeLessThan(40);
    vi.useRealTimers();
  });

  it("any transform write cancels a glide", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    result.current.baseDimsRef.current = { width: 800, height: 600 };
    act(() => result.current.setTransform({ scale: 2, x: 0, y: 0 }));

    act(() => result.current.startMomentum(1, 0));
    act(() => result.current.setTransform({ scale: 2, x: 5, y: 0 }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.transformRef.current.x).toBe(5);
    vi.useRealTimers();
  });

  it("shows the grabbing cursor while a drag pans", () => {
    const ref = makeWrapperRef();
    const { result } = renderHook(() => useImageZoomPan(ref, 0, true));
    act(() => result.current.setTransform({ scale: 2, x: 0, y: 0 }));
    expect(ref.current.style.cursor).toBe("grab");

    act(() => result.current.setGrabbing(true));
    expect(ref.current.style.cursor).toBe("grabbing");
    // Pan writes during the drag keep it.
    act(() => result.current.setTransform({ scale: 2, x: 1, y: 0 }));
    expect(ref.current.style.cursor).toBe("grabbing");

    act(() => result.current.setGrabbing(false));
    expect(ref.current.style.cursor).toBe("grab");
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
