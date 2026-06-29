import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ViewerItem } from "../types";
import { useSlideNavigation } from "./useSlideNavigation";

const items: ViewerItem[] = [
  { id: "0", src: "/a.jpg" },
  { id: "1", src: "/b.jpg" },
  { id: "2", src: "/c.jpg" },
];

function setup(index = 1, onSlideStart?: (d: "prev" | "next") => void) {
  const onNavigate = vi.fn();
  const hook = renderHook(() => useSlideNavigation(items, index, onNavigate, onSlideStart));
  act(() => {
    hook.result.current.slideTrackRef.current = document.createElement("div");
  });
  return { ...hook, onNavigate };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSlideNavigation", () => {
  it("applySlideOffset writes the offset to state and the track transform", () => {
    const { result } = setup();
    act(() => result.current.applySlideOffset(50));
    expect(result.current.swipeOffset).toBe(50);
    expect(result.current.slideTrackRef.current!.style.transform).toBe("translateX(50px)");
  });

  it("snapBack animates the track back to zero", () => {
    const { result } = setup();
    act(() => result.current.applySlideOffset(80));
    act(() => result.current.snapBack());
    expect(result.current.slideAnimating).toBe(true);
    expect(result.current.swipeOffset).toBe(0);

    // The fallback timer ends the animation and clears the active state.
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.slideAnimating).toBe(false);
    expect(result.current.slideActive).toBe(false);
  });

  it("commitSlide fires onSlideStart at the start and marks the slide active", () => {
    const onSlideStart = vi.fn();
    const { result } = setup(1, onSlideStart);
    act(() => result.current.commitSlide("next"));
    expect(onSlideStart).toHaveBeenCalledWith("next");
    expect(result.current.slideActive).toBe(true);
  });

  it("ignores a second commit while one is already in flight", () => {
    const onSlideStart = vi.fn();
    const { result } = setup(1, onSlideStart);
    act(() => result.current.commitSlide("next"));
    act(() => result.current.commitSlide("prev"));
    expect(onSlideStart).toHaveBeenCalledTimes(1);
  });

  it("resolveSlide snaps back for a small, slow drag", () => {
    const { result } = setup();
    act(() => result.current.applySlideOffset(10));
    act(() => result.current.resolveSlide(Date.now() - 1000));
    // Below the distance + velocity thresholds → snap back, not a commit.
    expect(result.current.slideAnimating).toBe(true);
    expect(result.current.swipeOffset).toBe(0);
  });
});
