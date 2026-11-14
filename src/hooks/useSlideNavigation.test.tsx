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
  it("applySlideOffset writes the offset to the ref and the track transform", () => {
    const { result } = setup();
    act(() => result.current.applySlideOffset(50));
    expect(result.current.swipeOffsetRef.current).toBe(50);
    expect(result.current.slideTrackRef.current!.style.transform).toBe("translateX(50px)");
  });

  it("fades the incoming neighbor imperatively, keeping the other pinned at 0", () => {
    const { result } = setup();
    act(() => {
      result.current.prevPanelRef.current = document.createElement("div");
      result.current.nextPanelRef.current = document.createElement("div");
    });
    // Drag toward next (negative offset): next fades in, prev stays hidden.
    act(() => result.current.applySlideOffset(-80));
    const prev = result.current.prevPanelRef.current!;
    const next = result.current.nextPanelRef.current!;
    expect(parseFloat(next.style.opacity)).toBeGreaterThan(0);
    expect(next.style.transition).toBe("none"); // live drag tracks the finger
    expect(prev.style.opacity).toBe("0");
    // An animated apply (commit/snap) glides the opacity instead of snapping.
    act(() => result.current.applySlideOffset(0, true));
    expect(next.style.opacity).toBe("0");
    expect(next.style.transition).toContain("opacity");
  });

  it("snapBack animates the track back to zero", () => {
    const { result } = setup();
    act(() => result.current.applySlideOffset(80));
    act(() => result.current.snapBack());
    expect(result.current.slideAnimating).toBe(true);
    expect(result.current.swipeOffsetRef.current).toBe(0);

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

  it("queues (never double-plays) a second commit while one is in flight", () => {
    const onSlideStart = vi.fn();
    const { result } = setup(1, onSlideStart);
    act(() => result.current.commitSlide("next"));
    // Queued for after the index paints (which never happens here — the index
    // is fixed in this harness), so it must not start a second slide now.
    act(() => result.current.commitSlide("prev"));
    expect(onSlideStart).toHaveBeenCalledTimes(1);
  });

  it("matches the commit duration to the release velocity, clamped to bounds", () => {
    // Run the commit's rAF synchronously so the animation start is observable.
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const { result } = setup();
    act(() => result.current.applySlideOffset(-200));
    // 200px in 20ms → 10 px/ms, far past the fast bound → clamps to the 160ms floor.
    act(() => result.current.resolveSlide(Date.now() - 20));
    expect(result.current.slideTrackRef.current!.style.transition).toContain("160ms");
    raf.mockRestore();
  });

  describe("with prefers-reduced-motion", () => {
    beforeEach(() => {
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("commits without a glide and navigates without waiting on a transition", async () => {
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        cb(0);
        return 0;
      });
      // jsdom's Image has no decode(); the commit preloads through it.
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          decode() {
            return Promise.resolve();
          }
        },
      );
      const { result, onNavigate } = setup();
      act(() => result.current.commitSlide("next"));
      expect(result.current.slideTrackRef.current!.style.transition).toBe("none");
      // The completion runs on the next tick (no transition fallback wait),
      // then hands off once the preload decode settles.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onNavigate).toHaveBeenCalledWith(2);
      raf.mockRestore();
    });

    it("navigates once when the decode settles after the timeout", async () => {
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        cb(0);
        return 0;
      });
      let settle!: () => void;
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          decode() {
            return new Promise<void>((resolve) => (settle = resolve));
          }
        },
      );
      const { result, onNavigate } = setup();
      act(() => result.current.commitSlide("next"));
      // A stalled decode: the timeout hands off anyway.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      // The decode finally lands; it must not navigate a second time.
      await act(async () => {
        settle();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      raf.mockRestore();
    });

    it("slides to a jump target, exposing it while the slide plays", async () => {
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          decode() {
            return Promise.resolve();
          }
        },
      );
      const onSlideStart = vi.fn();
      const { result, onNavigate } = setup(0, onSlideStart);
      act(() => result.current.commitSlide("next", undefined, 2));
      expect(onSlideStart).toHaveBeenCalledWith("next");
      expect(result.current.jumpTarget).toBe(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onNavigate).toHaveBeenCalledWith(2);
      raf.mockRestore();
    });

    it("snaps back instantly", () => {
      const { result } = setup();
      act(() => result.current.applySlideOffset(80));
      act(() => result.current.snapBack());
      expect(result.current.slideTrackRef.current!.style.transition).toBe("none");
      act(() => vi.advanceTimersByTime(0));
      expect(result.current.slideActive).toBe(false);
    });
  });

  it("freezes the slide distance during a commit so a late neighbor onLoad can't snap the landing", () => {
    const { result } = setup();
    // Commit locks the track's travel distance imperatively.
    act(() => result.current.commitSlide("next"));
    const committed = result.current.slideDistance;
    expect(committed).toBeGreaterThan(0);

    // A neighbor image finishes decoding mid-commit and reports a real (wider)
    // size — the onLoad handler calls refreshSlideDistance. It must NOT move the
    // panel now, or the incoming image lands off-center and snaps on navigate.
    const img = document.createElement("div");
    img.className = "rvl-img";
    Object.defineProperty(img, "offsetWidth", { value: 400, configurable: true });
    result.current.slideTrackRef.current!.appendChild(img);

    act(() => result.current.refreshSlideDistance());
    expect(result.current.slideDistance).toBe(committed);
  });

  it("resolveSlide snaps back for a small, slow drag", () => {
    const { result } = setup();
    act(() => result.current.applySlideOffset(10));
    act(() => result.current.resolveSlide(Date.now() - 1000));
    // Below the distance + velocity thresholds → snap back, not a commit.
    expect(result.current.slideAnimating).toBe(true);
    expect(result.current.swipeOffsetRef.current).toBe(0);
  });
});
