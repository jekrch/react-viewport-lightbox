import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThemeColor } from "./useThemeColor";

function themeMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="theme-color"]:not([media])');
}

afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
  document.documentElement.style.removeProperty("--rvl-theme-color");
  document.documentElement.style.removeProperty("background-color");
  document.documentElement.style.removeProperty("--rvl-backdrop-in");
});

describe("useThemeColor", () => {
  it("creates a theme-color meta while active and removes it on unmount", () => {
    expect(themeMeta()).toBeNull();
    const { unmount } = renderHook(() => useThemeColor(true));
    expect(themeMeta()?.getAttribute("content")).toBe("#000000");
    unmount();
    expect(themeMeta()).toBeNull();
  });

  it("reads the color from the --rvl-theme-color custom property", () => {
    document.documentElement.style.setProperty("--rvl-theme-color", "#123456");
    const { unmount } = renderHook(() => useThemeColor(true));
    expect(themeMeta()?.getAttribute("content")).toBe("#123456");
    unmount();
  });

  it("restores a pre-existing theme-color instead of removing it", () => {
    const existing = document.createElement("meta");
    existing.setAttribute("name", "theme-color");
    existing.setAttribute("content", "#ffffff");
    document.head.appendChild(existing);

    const { unmount } = renderHook(() => useThemeColor(true));
    expect(themeMeta()?.getAttribute("content")).toBe("#000000");
    unmount();
    expect(themeMeta()).toBe(existing);
    expect(existing.getAttribute("content")).toBe("#ffffff");
  });

  it("does nothing when inactive", () => {
    renderHook(() => useThemeColor(false));
    expect(themeMeta()).toBeNull();
  });

  it("reference-counts concurrent activations so the last deactivation wins", () => {
    const a = renderHook(() => useThemeColor(true));
    const b = renderHook(() => useThemeColor(true));
    expect(themeMeta()?.getAttribute("content")).toBe("#000000");

    a.unmount();
    expect(themeMeta()?.getAttribute("content")).toBe("#000000");

    b.unmount();
    expect(themeMeta()).toBeNull();
  });

  it("overrides the root background after the open fade and restores it on unmount", () => {
    vi.useFakeTimers();
    document.documentElement.style.backgroundColor = "rgb(10, 20, 30)";

    const { unmount } = renderHook(() => useThemeColor(true));
    // Not yet swapped: at mount the backdrop is still transparent, so an
    // immediate swap could flash a host page whose canvas bg shows through.
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");

    vi.advanceTimersByTime(400);
    const overridden = document.documentElement.style.backgroundColor;
    expect(overridden).not.toBe("rgb(10, 20, 30)");
    expect(overridden).not.toBe("");

    unmount();
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");
  });

  it("hands the root background back at close start, keeping the meta until unmount", () => {
    vi.useFakeTimers();
    document.documentElement.style.backgroundColor = "rgb(10, 20, 30)";

    const { rerender, unmount } = renderHook(({ closing }) => useThemeColor(true, closing), {
      initialProps: { closing: false },
    });
    vi.advanceTimersByTime(400);
    expect(document.documentElement.style.backgroundColor).not.toBe("rgb(10, 20, 30)");

    rerender({ closing: true });
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");
    expect(themeMeta()).not.toBeNull();

    unmount();
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");
    expect(themeMeta()).toBeNull();
  });

  it("never swaps the background for a close that starts mid-fade-in", () => {
    vi.useFakeTimers();
    document.documentElement.style.backgroundColor = "rgb(10, 20, 30)";

    const { rerender } = renderHook(({ closing }) => useThemeColor(true, closing), {
      initialProps: { closing: false },
    });
    rerender({ closing: true });
    vi.advanceTimersByTime(1000);
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");
  });

  it("leaves the background to another overlay still open", () => {
    vi.useFakeTimers();
    document.documentElement.style.backgroundColor = "rgb(10, 20, 30)";

    const other = renderHook(() => useThemeColor(true));
    const { rerender, unmount } = renderHook(({ closing }) => useThemeColor(true, closing), {
      initialProps: { closing: false },
    });
    vi.advanceTimersByTime(400);
    rerender({ closing: true });
    expect(document.documentElement.style.backgroundColor).not.toBe("rgb(10, 20, 30)");
    unmount();
    other.unmount();
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");
  });

  it("cancels a pending root-background swap when unmounted mid-fade", () => {
    vi.useFakeTimers();
    document.documentElement.style.backgroundColor = "rgb(10, 20, 30)";

    const { unmount } = renderHook(() => useThemeColor(true));
    unmount();

    vi.advanceTimersByTime(1000);
    expect(document.documentElement.style.backgroundColor).toBe("rgb(10, 20, 30)");
  });

  it("times the background swap off the backdrop's fade-in", () => {
    vi.useFakeTimers();
    document.documentElement.style.setProperty("--rvl-backdrop-in", "500ms");
    const { unmount } = renderHook(() => useThemeColor(true));
    vi.advanceTimersByTime(540);
    expect(document.documentElement.style.backgroundColor).toBe("");
    vi.advanceTimersByTime(20);
    expect(document.documentElement.style.backgroundColor).not.toBe("");
    unmount();
  });
});

describe("useThemeColor Safari resample on close", () => {
  /** Pretend to be iOS Safari, with a spied scrollTo and manually run frames. */
  function asIOS() {
    const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "iPhone" });
    const scrollTo = vi.fn();
    const originalScrollTo = window.scrollTo;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const frames: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => frames.push(cb));
    return {
      scrollTo,
      flushFrames: () => frames.splice(0).forEach((cb) => cb(0)),
      restore: () => {
        if (platform) Object.defineProperty(navigator, "platform", platform);
        else delete (navigator as { platform?: string }).platform;
        window.scrollTo = originalScrollTo;
        raf.mockRestore();
      },
    };
  }

  it("nudges the scroll once the page is back, so the bars resample", () => {
    vi.useFakeTimers();
    const ios = asIOS();
    try {
      const { unmount } = renderHook(() => useThemeColor(true));
      unmount();
      expect(ios.scrollTo).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(ios.scrollTo).toHaveBeenCalledTimes(1);
      ios.flushFrames();
      // Off a pixel, then back.
      expect(ios.scrollTo).toHaveBeenCalledTimes(2);
      expect(ios.scrollTo).toHaveBeenLastCalledWith(0, window.scrollY);
    } finally {
      ios.restore();
    }
  });

  it("skips it when another overlay opened meanwhile", () => {
    vi.useFakeTimers();
    const ios = asIOS();
    try {
      renderHook(() => useThemeColor(true)).unmount();
      const next = renderHook(() => useThemeColor(true));
      vi.advanceTimersByTime(100);
      expect(ios.scrollTo).not.toHaveBeenCalled();
      next.unmount();
    } finally {
      ios.restore();
    }
  });

  it("does nothing off iOS", () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    const original = window.scrollTo;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    try {
      renderHook(() => useThemeColor(true)).unmount();
      vi.advanceTimersByTime(1000);
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      window.scrollTo = original;
    }
  });
});
