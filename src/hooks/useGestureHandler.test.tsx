import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRef, type PointerEvent, type TouchEvent } from "react";
import type { ViewerItem } from "../types";
import { useImageZoomPan } from "./useImageZoomPan";
import { useSlideNavigation } from "./useSlideNavigation";
import { useGestureHandler } from "./useGestureHandler";

const items: ViewerItem[] = [
  { id: "0", src: "/a.jpg" },
  { id: "1", src: "/b.jpg" },
  { id: "2", src: "/c.jpg" },
];

const mouse = (clientX: number, clientY: number) =>
  ({ pointerType: "mouse", clientX, clientY, preventDefault() {} }) as unknown as PointerEvent;

const touch = (points: [number, number][], changed: [number, number][] = []) =>
  ({
    touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
    changedTouches: changed.map(([clientX, clientY]) => ({ clientX, clientY })),
    preventDefault() {},
  }) as unknown as TouchEvent;

function setup({ index = 0, zoomEnabled = true } = {}) {
  const onNavigate = vi.fn();
  const hook = renderHook(() => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const zoomPan = useImageZoomPan(wrapperRef, index, true);
    const slide = useSlideNavigation(items, index, onNavigate);
    const gestures = useGestureHandler(
      zoomPan,
      slide,
      index > 0,
      index < items.length - 1,
      zoomEnabled,
    );
    return { wrapperRef, zoomPan, slide, gestures };
  });
  // Wire up real DOM nodes for the refs the handlers write to.
  act(() => {
    hook.result.current.wrapperRef.current = document.createElement("div");
    hook.result.current.slide.slideTrackRef.current = document.createElement("div");
  });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useGestureHandler — slide (mouse)", () => {
  it("tracks a horizontal drag as a slide offset", () => {
    const { result } = setup({ index: 1 });
    act(() => result.current.gestures.handlePointerDown(mouse(100, 100)));
    act(() => result.current.gestures.handlePointerMove(mouse(60, 102)));
    expect(result.current.slide.swipeOffsetRef.current).toBe(-40);
  });

  it("rejects a mostly-vertical drag (treated as a scroll)", () => {
    const { result } = setup({ index: 1 });
    act(() => result.current.gestures.handlePointerDown(mouse(100, 100)));
    act(() => result.current.gestures.handlePointerMove(mouse(102, 160)));
    expect(result.current.slide.swipeOffsetRef.current).toBe(0);
  });

  it("applies rubber-band resistance dragging past the first item", () => {
    const { result } = setup({ index: 0 });
    act(() => result.current.gestures.handlePointerDown(mouse(100, 100)));
    act(() => result.current.gestures.handlePointerMove(mouse(200, 100)));
    // hasPrev is false at index 0, so a +100 drag is damped to 100 * 0.2.
    expect(result.current.slide.swipeOffsetRef.current).toBe(20);
  });

  it("flags a moved gesture so a background swipe isn't mistaken for a tap", () => {
    const { result } = setup({ index: 1 });
    // A stationary press/release is a tap: the flag stays false so the backdrop
    // close can fire.
    act(() => result.current.gestures.handlePointerDown(mouse(100, 100)));
    expect(result.current.gestures.gestureMovedRef.current).toBe(false);
    // A horizontal drag past the threshold is a swipe: the flag flips true so a
    // release over empty space navigates instead of closing.
    act(() => result.current.gestures.handlePointerMove(mouse(60, 100)));
    expect(result.current.gestures.gestureMovedRef.current).toBe(true);
  });

  it("flags even a rejected (vertical) drag as moved, not a tap", () => {
    const { result } = setup({ index: 1 });
    act(() => result.current.gestures.handlePointerDown(mouse(100, 100)));
    act(() => result.current.gestures.handlePointerMove(mouse(102, 160)));
    expect(result.current.gestures.gestureMovedRef.current).toBe(true);
  });

  it("ignores pointer events whose type is touch", () => {
    const { result } = setup({ index: 1 });
    const touchPointer = {
      pointerType: "touch",
      clientX: 0,
      clientY: 0,
    } as unknown as PointerEvent;
    act(() => result.current.gestures.handlePointerDown(touchPointer));
    act(() => result.current.gestures.handlePointerMove(touchPointer));
    expect(result.current.slide.swipeOffsetRef.current).toBe(0);
  });
});

describe("useGestureHandler — zoom (touch)", () => {
  it("pinch-zooms in proportionally to the finger spread", () => {
    const { result } = setup({ index: 0 });
    act(() =>
      result.current.gestures.handleTouchStart(
        touch([
          [0, 0],
          [100, 0],
        ]),
      ),
    );
    act(() =>
      result.current.gestures.handleTouchMove(
        touch([
          [0, 0],
          [200, 0],
        ]),
      ),
    );
    // Spread doubled → scale 2 (written to transformRef; UI syncs on touchEnd).
    expect(result.current.zoomPan.transformRef.current.scale).toBe(2);
  });

  it("re-renders only on the zoomed-boundary flip mid-pinch, syncing on touch end", () => {
    const { result } = setup({ index: 0 });
    act(() =>
      result.current.gestures.handleTouchStart(
        touch([
          [0, 0],
          [100, 0],
        ]),
      ),
    );
    // First frame crosses 1 → isZoomed must flip immediately, carrying this
    // frame's scale into state.
    act(() =>
      result.current.gestures.handleTouchMove(
        touch([
          [0, 0],
          [150, 0],
        ]),
      ),
    );
    expect(result.current.zoomPan.displayScale).toBe(1.5);
    // Further frames stay on the zoomed side of the boundary: the transform
    // advances but React state deliberately does not (no per-frame render).
    act(() =>
      result.current.gestures.handleTouchMove(
        touch([
          [0, 0],
          [200, 0],
        ]),
      ),
    );
    expect(result.current.zoomPan.transformRef.current.scale).toBe(2);
    expect(result.current.zoomPan.displayScale).toBe(1.5);
    // Lifting a finger settles the gesture and syncs the exact scale.
    act(() => result.current.gestures.handleTouchEnd(touch([[0, 0]])));
    expect(result.current.zoomPan.displayScale).toBe(2);
  });

  it("does not pinch-zoom when zoom is disabled", () => {
    const { result } = setup({ index: 0, zoomEnabled: false });
    act(() =>
      result.current.gestures.handleTouchStart(
        touch([
          [0, 0],
          [100, 0],
        ]),
      ),
    );
    act(() =>
      result.current.gestures.handleTouchMove(
        touch([
          [0, 0],
          [200, 0],
        ]),
      ),
    );
    expect(result.current.zoomPan.transformRef.current.scale).toBe(1);
  });

  it("double-tap zooms in", () => {
    const { result } = setup({ index: 0 });
    // Two taps at the same spot within the double-tap window (system time frozen).
    act(() => result.current.gestures.handleTouchEnd(touch([], [[50, 50]])));
    act(() => result.current.gestures.handleTouchEnd(touch([], [[50, 50]])));
    expect(result.current.zoomPan.displayScale).toBe(2.5);
    expect(result.current.zoomPan.isZoomed).toBe(true);
  });
});

describe("useGestureHandler — zoomed pan", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
    });
  });

  function zoomed() {
    const hook = setup({ index: 1 });
    const { zoomPan } = hook.result.current;
    zoomPan.baseDimsRef.current = { width: 800, height: 600 };
    act(() => zoomPan.setTransform({ scale: 2, x: 0, y: 0 }));
    return hook;
  }

  it("shows grabbing while a mouse drag pans, and coasts after a quick release", () => {
    const { result } = zoomed();
    const wrapper = () => result.current.wrapperRef.current!;
    act(() => result.current.gestures.handlePointerDown(mouse(500, 400)));
    expect(wrapper().style.cursor).toBe("grabbing");
    for (let i = 1; i <= 5; i++) {
      act(() => void vi.advanceTimersByTime(16));
      act(() => result.current.gestures.handlePointerMove(mouse(500 - i * 10, 400)));
    }
    act(() => result.current.gestures.handlePointerUp(mouse(450, 400)));
    expect(wrapper().style.cursor).toBe("grab");
    const released = result.current.zoomPan.transformRef.current.x;
    expect(released).toBe(-50);
    act(() => void vi.advanceTimersByTime(500));
    // ~0.6 px/ms leftward keeps it moving past where the pointer let go.
    expect(result.current.zoomPan.transformRef.current.x).toBeLessThan(released - 50);
  });

  it("doesn't coast when the pointer stopped before release", () => {
    const { result } = zoomed();
    act(() => result.current.gestures.handlePointerDown(mouse(500, 400)));
    act(() => void vi.advanceTimersByTime(16));
    act(() => result.current.gestures.handlePointerMove(mouse(450, 400)));
    act(() => void vi.advanceTimersByTime(200));
    act(() => result.current.gestures.handlePointerUp(mouse(450, 400)));
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.zoomPan.transformRef.current.x).toBe(-50);
  });

  it("a touch pan coasts after release, and a new touch stops the glide", () => {
    const { result } = zoomed();
    const g = () => result.current.gestures;
    act(() => g().handleTouchStart(touch([[500, 400]])));
    for (let i = 1; i <= 5; i++) {
      act(() => void vi.advanceTimersByTime(16));
      act(() => g().handleTouchMove(touch([[500, 400 - i * 10]])));
    }
    act(() => g().handleTouchEnd(touch([], [[500, 350]])));
    act(() => void vi.advanceTimersByTime(48));
    const gliding = result.current.zoomPan.transformRef.current.y;
    expect(gliding).toBeLessThan(-50);
    act(() => g().handleTouchStart(touch([[500, 300]])));
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.zoomPan.transformRef.current.y).toBe(gliding);
  });
});

describe("useGestureHandler — taps while zoomed", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
    });
  });

  it("a slow pan isn't a tap, and a touch that stops a glide isn't one either", () => {
    const { result } = setup({ index: 1 });
    const { zoomPan } = result.current;
    zoomPan.baseDimsRef.current = { width: 800, height: 600 };
    act(() => zoomPan.setTransform({ scale: 2, x: 0, y: 0 }));
    const g = () => result.current.gestures;

    act(() => g().handleTouchStart(touch([[500, 400]])));
    for (let i = 1; i <= 10; i++) {
      act(() => void vi.advanceTimersByTime(16));
      act(() => g().handleTouchMove(touch([[500, 400 - i * 3]])));
    }
    expect(g().gestureMovedRef.current).toBe(true);
    act(() => g().handleTouchEnd(touch([], [[500, 370]])));

    // Gliding now; a touch that lands within the double-tap window stops it
    // without zooming back out.
    act(() => void vi.advanceTimersByTime(30));
    act(() => g().handleTouchStart(touch([[500, 370]])));
    expect(g().gestureMovedRef.current).toBe(true);
    act(() => g().handleTouchEnd(touch([], [[500, 370]])));
    expect(result.current.zoomPan.transformRef.current.scale).toBe(2);
  });
});
