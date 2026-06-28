import { describe, it, expect } from "vitest";
import { clampTranslate, resolveSlideDirection } from "./math";

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
