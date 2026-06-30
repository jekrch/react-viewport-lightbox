import { describe, it, expect } from "vitest";
import { clampTranslate, resolveSlideDirection, zoomToPoint } from "./math";

const viewport = { width: 1000, height: 800 };

describe("clampTranslate", () => {
  it("pins to origin when not zoomed", () => {
    expect(clampTranslate(500, 500, 1, { width: 2000, height: 2000 }, viewport)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("pins to origin when base dimensions are unknown", () => {
    expect(clampTranslate(500, 500, 3, { width: 0, height: 0 }, viewport)).toEqual({ x: 0, y: 0 });
  });

  it("allows translation up to the overflow half-extent", () => {
    // 1000px-wide image at 2x → scaledHalfW = 1000, vpHalfW = 500, maxX = 500.
    // 800px-tall image at 2x → scaledHalfH = 800, vpHalfH = 400, maxY = 400.
    const base = { width: 1000, height: 800 };
    expect(clampTranslate(9999, 9999, 2, base, viewport)).toEqual({ x: 500, y: 400 });
    expect(clampTranslate(-9999, -9999, 2, base, viewport)).toEqual({ x: -500, y: -400 });
  });

  it("passes through values within bounds", () => {
    const base = { width: 1000, height: 800 };
    expect(clampTranslate(120, -90, 2, base, viewport)).toEqual({ x: 120, y: -90 });
  });

  it("clamps to zero when the scaled image is smaller than the viewport", () => {
    // Tiny image scaled 2x is still smaller than the viewport → no panning room.
    const base = { width: 100, height: 100 };
    expect(clampTranslate(50, 50, 2, base, viewport)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoomToPoint", () => {
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  // The viewer scales the wrapper about the viewport center, so a content point
  // appears on screen at `center + scale * (point - center) + translate`. This
  // resolves the content point under `focal` before the zoom and asserts it
  // lands back on `focal` after applying the computed translate.
  const screenOf = (
    focal: { x: number; y: number },
    prevScale: number,
    prev: { x: number; y: number },
    nextScale: number,
    next: { x: number; y: number },
  ) => {
    const relX = (focal.x - center.x - prev.x) / prevScale;
    const relY = (focal.y - center.y - prev.y) / prevScale;
    return {
      x: center.x + nextScale * relX + next.x,
      y: center.y + nextScale * relY + next.y,
    };
  };

  it("keeps the focal point anchored when zooming from rest", () => {
    const focal = { x: 700, y: 300 };
    const next = zoomToPoint(1, 2, { x: 0, y: 0 }, focal, viewport);
    expect(screenOf(focal, 1, { x: 0, y: 0 }, 2, next)).toEqual(focal);
  });

  it("keeps the focal point anchored across an incremental zoom step", () => {
    const focal = { x: 250, y: 650 };
    const prev = { x: -40, y: 25 };
    const next = zoomToPoint(2, 2.6, prev, focal, viewport);
    const after = screenOf(focal, 2, prev, 2.6, next);
    expect(after.x).toBeCloseTo(focal.x);
    expect(after.y).toBeCloseTo(focal.y);
  });

  it("leaves the translate unchanged when the focal point is the center", () => {
    expect(zoomToPoint(1, 3, { x: 0, y: 0 }, center, viewport)).toEqual({ x: 0, y: 0 });
  });

  it("is a no-op when the scale does not change", () => {
    const prev = { x: 30, y: -10 };
    expect(zoomToPoint(2, 2, prev, { x: 800, y: 100 }, viewport)).toEqual(prev);
  });
});

describe("resolveSlideDirection", () => {
  const base = { elapsedMs: 1000, viewportWidth: 1000, hasPrev: true, hasNext: true };

  it("commits prev when dragged right past the distance threshold", () => {
    expect(resolveSlideDirection({ ...base, offset: 300 })).toBe("prev");
  });

  it("commits next when dragged left past the distance threshold", () => {
    expect(resolveSlideDirection({ ...base, offset: -300 })).toBe("next");
  });

  it("snaps back for a small slow drag", () => {
    expect(resolveSlideDirection({ ...base, offset: 100 })).toBe("snap");
  });

  it("commits on a fast fling even below the distance threshold", () => {
    // 100px in 50ms = 2 px/ms, well over the 0.4 velocity threshold.
    expect(resolveSlideDirection({ ...base, offset: -100, elapsedMs: 50 })).toBe("next");
  });

  it("does not commit prev at the first item", () => {
    expect(resolveSlideDirection({ ...base, offset: 400, hasPrev: false })).toBe("snap");
  });

  it("does not commit next at the last item", () => {
    expect(resolveSlideDirection({ ...base, offset: -400, hasNext: false })).toBe("snap");
  });

  it("respects the distance threshold boundary (exclusive)", () => {
    // threshold = 1000 * 0.25 = 250; exactly 250 should not commit.
    expect(resolveSlideDirection({ ...base, offset: 250 })).toBe("snap");
    expect(resolveSlideDirection({ ...base, offset: 251 })).toBe("prev");
  });
});
