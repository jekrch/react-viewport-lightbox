import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSharedElementZoom, type SharedElementZoomArgs } from "./useSharedElementZoom";
import type { ViewerItem, ViewerRect } from "../types";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const item: ViewerItem = { id: "a", src: "/full.jpg", alt: "A" };
const thumbRect: ViewerRect = { left: 20, top: 10, width: 100, height: 60 };
const restRect: ViewerRect = { left: 200, top: 100, width: 400, height: 240 };

function rect(r: ViewerRect): DOMRect {
  return {
    ...r,
    right: r.left + r.width,
    bottom: r.top + r.height,
    x: r.left,
    y: r.top,
  } as DOMRect;
}

/** The DOM the hook drives: a wrapper around the active <img>, plus the bottom bar. */
function dom() {
  const wrapper = document.createElement("div");
  const img = document.createElement("img");
  const bar = document.createElement("div");
  wrapper.appendChild(img);
  document.body.append(wrapper, bar);
  img.getBoundingClientRect = () => rect(restRect);
  const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation);
  img.animate = animate as unknown as HTMLElement["animate"];
  return { wrapper, img, bar, animate };
}

function setup(
  els: ReturnType<typeof dom>,
  args: Partial<SharedElementZoomArgs> = {},
): ReturnType<
  typeof renderHook<ReturnType<typeof useSharedElementZoom>, Partial<SharedElementZoomArgs>>
> {
  const base: SharedElementZoomArgs = {
    item,
    index: 0,
    isZoomed: false,
    imgRef: { current: els.img },
    imgWrapperRef: { current: els.wrapper },
    bottomBarRef: { current: els.bar },
    viewportH: "100dvh",
    measureBaseDims: vi.fn(),
  };
  return renderHook(
    (props: Partial<SharedElementZoomArgs>) => useSharedElementZoom({ ...base, ...props }),
    { initialProps: args },
  );
}

/** A tile whose <img> has already loaded, as an on-screen thumbnail has. */
function loadedTile(src: string): HTMLElement {
  const el = document.createElement("div");
  const img = document.createElement("img");
  img.src = src;
  Object.defineProperty(img, "complete", { value: true });
  Object.defineProperty(img, "naturalWidth", { value: 400 });
  Object.defineProperty(img, "naturalHeight", { value: 300 });
  el.appendChild(img);
  return el;
}

describe("useSharedElementZoom: placeholder", () => {
  it("uses the origin tile's loaded image", () => {
    const tile = loadedTile("/tile.jpg");
    const { result } = setup(dom(), { getOrigin: () => tile });
    expect(result.current.placeholderSrc).toMatch(/\/tile\.jpg$/);
  });

  it("falls back to item.thumbnail", () => {
    const { result } = setup(dom(), { item: { ...item, thumbnail: "/thumb.jpg" } });
    expect(result.current.placeholderSrc).toBe("/thumb.jpg");
  });

  it("skips a placeholder that is the full image", () => {
    const tile = loadedTile("/full.jpg");
    const { result } = setup(dom(), { getOrigin: () => tile });
    expect(result.current.placeholderSrc).toBeNull();
  });

  it("has none without a tile image or thumbnail", () => {
    const { result } = setup(dom(), { getOrigin: () => thumbRect });
    expect(result.current.placeholderSrc).toBeNull();
  });

  it("drops a placeholder that fails to load", () => {
    const { result } = setup(dom(), { item: { ...item, thumbnail: "/thumb.jpg" } });
    act(() => result.current.onImageError());
    expect(result.current.placeholderSrc).toBeNull();
    expect(result.current.fullLoaded).toBe(false);
  });

  it("drops the placeholder after paging off the opening item, for good", () => {
    const thumbItem = { ...item, thumbnail: "/thumb.jpg" };
    const { result, rerender } = setup(dom(), { item: thumbItem });
    rerender({ item: thumbItem, index: 1 });
    expect(result.current.placeholderSrc).toBeNull();
    rerender({ item: thumbItem, index: 0 });
    expect(result.current.placeholderSrc).toBeNull();
  });
});

describe("useSharedElementZoom: entry gating", () => {
  it("holds the image hidden until it loads when zooming from a thumbnail", () => {
    const els = dom();
    const { result } = setup(els, { getOrigin: () => thumbRect });
    expect(result.current.gateEntry).toBe(true);
    expect(result.current.holdHidden).toBe(true);
    act(() => result.current.onImageLoad());
    expect(result.current.fullLoaded).toBe(true);
    expect(result.current.holdHidden).toBe(false);
  });

  it("never hides the image without getOrigin or a placeholder", () => {
    const { result } = setup(dom());
    expect(result.current.zoomTransition).toBe(false);
    expect(result.current.holdHidden).toBe(false);
  });

  it("reveals a broken image rather than stranding the open", () => {
    const { result } = setup(dom(), { getOrigin: () => thumbRect });
    act(() => result.current.onImageError());
    expect(result.current.fullLoaded).toBe(true);
    expect(result.current.holdHidden).toBe(false);
  });

  it("plays the entry zoom from the thumbnail once loaded, pinned before paint", () => {
    const els = dom();
    const { result } = setup(els, { getOrigin: () => thumbRect });
    act(() => result.current.onImageLoad());
    // Pinned synchronously to the thumbnail pose so no full-size frame paints.
    expect(els.img.style.transform).toBe("translate(-180px, -90px) scale(0.25, 0.25)");
    expect(els.wrapper.style.overflow).toBe("visible");
    expect(els.animate).toHaveBeenCalledTimes(1);
  });

  it("reports the entry settled when the zoom lands", () => {
    const els = dom();
    const { result } = setup(els, { getOrigin: () => thumbRect });
    act(() => result.current.onImageLoad());
    expect(result.current.entrySettled).toBe(false);
    const anim = els.animate.mock.results[0].value as Animation;
    act(() => {
      (anim.onfinish as () => void)();
    });
    expect(result.current.entrySettled).toBe(true);
  });

  it("reports the entry settled when the zoom can't play", () => {
    const els = dom();
    els.img.getBoundingClientRect = () => rect({ ...restRect, top: -2000 });
    const { result } = setup(els, { getOrigin: () => thumbRect });
    act(() => result.current.onImageLoad());
    expect(result.current.entrySettled).toBe(true);
  });

  it("hands getOrigin the active item", () => {
    const getOrigin = vi.fn().mockReturnValue(thumbRect);
    const { result } = setup(dom(), { getOrigin, index: 3 });
    act(() => result.current.onImageLoad());
    expect(getOrigin).toHaveBeenCalledWith(3, item);
  });

  it("skips the entry zoom when the image is off screen", () => {
    const els = dom();
    els.img.getBoundingClientRect = () => rect({ ...restRect, top: -2000 });
    const { result } = setup(els, { getOrigin: () => thumbRect });
    act(() => result.current.onImageLoad());
    expect(els.animate).not.toHaveBeenCalled();
    expect(els.img.style.transform).toBe("");
  });

  it("settleEntry tears an in-flight entry down to the resting pose", () => {
    const els = dom();
    const { result } = setup(els, { getOrigin: () => thumbRect });
    act(() => result.current.onImageLoad());
    act(() => result.current.settleEntry());
    expect(els.img.style.transform).toBe("");
    expect(els.wrapper.style.overflow).toBe("");
  });
});

describe("useSharedElementZoom: spinner", () => {
  it("shows only once a load runs past 500ms, and clears on load", () => {
    vi.useFakeTimers();
    const { result } = setup(dom());
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.showSpinner).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showSpinner).toBe(true);
    act(() => result.current.onImageLoad());
    expect(result.current.showSpinner).toBe(false);
  });
});

describe("useSharedElementZoom: collapse", () => {
  const lastKeyframes = (animate: ReturnType<typeof vi.fn>) =>
    animate.mock.calls.at(-1)![0] as Keyframe[];

  it("falls back (returns false) without getOrigin", () => {
    const els = dom();
    const { result } = setup(els);
    let played = true;
    act(() => {
      played = result.current.playCollapse();
    });
    expect(played).toBe(false);
    expect(result.current.collapsing).toBe(false);
  });

  it("falls back while zoomed", () => {
    const { result } = setup(dom(), { getOrigin: () => thumbRect, isZoomed: true });
    expect(result.current.playCollapse()).toBe(false);
  });

  it("falls back when the thumbnail has scrolled out of view", () => {
    const { result } = setup(dom(), { getOrigin: () => ({ ...thumbRect, top: 5000 }) });
    expect(result.current.playCollapse()).toBe(false);
  });

  it("flies the resting image into the thumbnail", () => {
    const els = dom();
    const { result } = setup(els, { getOrigin: () => thumbRect });
    let played = false;
    act(() => {
      played = result.current.playCollapse();
    });
    expect(played).toBe(true);
    expect(result.current.collapsing).toBe(true);
    const frames = lastKeyframes(els.animate);
    expect(frames[0].transform).toBe("none");
    expect(frames[1].transform).toBe("translate(-180px, -90px) scale(0.25, 0.25)");
  });

  it("maps the flight through a swipe-to-close pose the wrapper still carries", () => {
    const els = dom();
    // The dragged pose: half size, moved. The image's rect reads through it
    // until the wrapper's transform is lifted for measuring.
    els.wrapper.style.transform = "translate3d(0px, 100px, 0px) scale(0.5)";
    const carried = els.wrapper.style.transform;
    const posed: ViewerRect = { left: 300, top: 260, width: 200, height: 120 };
    els.img.getBoundingClientRect = () =>
      rect(els.wrapper.style.transform === "none" ? restRect : posed);
    const { result } = setup(els, { getOrigin: () => thumbRect });
    act(() => {
      result.current.playCollapse();
    });
    // Under the 0.5 pose, landing on the 100×60 thumbnail at (20, 10) means a
    // local scale of 0.5 and an offset that the pose then halves.
    const frames = lastKeyframes(els.animate);
    expect(frames[1].transform).toBe("translate(-560px, -500px) scale(0.5, 0.5)");
    // The pose is put back: the flight plays inside it.
    expect(els.wrapper.style.transform).toBe(carried);
  });
});
