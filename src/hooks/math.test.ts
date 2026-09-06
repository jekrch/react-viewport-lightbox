import { describe, it, expect } from "vitest";
import {
  clampTranslate,
  computeZoomTransform,
  coverRect,
  cropFadeProgress,
  cropFeather,
  cropInsets,
  cropMask,
  cropsAnything,
  parseObjectPosition,
  resolveSlideDirection,
  zoomToPoint,
} from "./math";

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

describe("computeZoomTransform", () => {
  const base = { width: 1000, height: 800 };
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  it("snaps to the origin when zooming back to <= 1", () => {
    expect(
      computeZoomTransform({
        prevScale: 2,
        nextScale: 1,
        prev: { x: 120, y: -40 },
        focal: { x: 700, y: 300 },
        viewport,
        baseDims: base,
        zoomToCursor: true,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("anchors on the focal point, then clamps to the viewport", () => {
    // Matches zoomToPoint's own math, run through clampTranslate.
    const focal = { x: 700, y: 300 };
    const raw = zoomToPoint(1, 2, { x: 0, y: 0 }, focal, viewport);
    const expected = clampTranslate(raw.x, raw.y, 2, base, viewport);
    expect(
      computeZoomTransform({
        prevScale: 1,
        nextScale: 2,
        prev: { x: 0, y: 0 },
        focal,
        viewport,
        baseDims: base,
        zoomToCursor: true,
      }),
    ).toEqual(expected);
  });

  it("holds the current translate (clamped) when zoomToCursor is off", () => {
    expect(
      computeZoomTransform({
        prevScale: 1,
        nextScale: 2,
        prev: { x: 120, y: -90 },
        focal: { x: 700, y: 300 },
        viewport,
        baseDims: base,
        zoomToCursor: false,
      }),
    ).toEqual(clampTranslate(120, -90, 2, base, viewport));
  });

  it("adds focalPan (pinch midpoint drift) before clamping", () => {
    const focal = center; // center focal → zoomToPoint contributes nothing
    const focalPan = { x: 30, y: -20 };
    expect(
      computeZoomTransform({
        prevScale: 1,
        nextScale: 2,
        prev: { x: 0, y: 0 },
        focal,
        viewport,
        baseDims: base,
        zoomToCursor: true,
        focalPan,
      }),
    ).toEqual(clampTranslate(30, -20, 2, base, viewport));
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

describe("parseObjectPosition", () => {
  it("reads the percentages browsers compute the property to", () => {
    expect(parseObjectPosition("50% 22%")).toEqual({ x: 0.5, y: 0.22 });
  });

  it("reads keywords", () => {
    expect(parseObjectPosition("left top")).toEqual({ x: 0, y: 0 });
    expect(parseObjectPosition("right bottom")).toEqual({ x: 1, y: 1 });
  });

  it("centers on a missing axis or a unit it cannot read as a fraction", () => {
    expect(parseObjectPosition("center")).toEqual({ x: 0.5, y: 0.5 });
    expect(parseObjectPosition("10px 20px")).toEqual({ x: 0.5, y: 0.5 });
    expect(parseObjectPosition("")).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("coverRect", () => {
  const box = { left: 100, top: 50, width: 200, height: 100 };

  it("fills the box and overflows on the cropped axis only", () => {
    const r = coverRect(box, { width: 200, height: 200 }, { x: 0.5, y: 0.5 });
    expect(r).toEqual({ left: 100, top: 0, width: 200, height: 200 });
  });

  it("hangs the overflow where object-position puts it", () => {
    expect(coverRect(box, { width: 200, height: 200 }, { x: 0.5, y: 0 }).top).toBe(50);
    expect(coverRect(box, { width: 200, height: 200 }, { x: 0.5, y: 1 }).top).toBe(-50);
    expect(coverRect(box, { width: 200, height: 200 }, { x: 0.5, y: 0.22 }).top).toBeCloseTo(28);
  });

  it("scales up to cover a box larger than the image", () => {
    const r = coverRect(box, { width: 50, height: 50 }, { x: 0.5, y: 0.5 });
    expect(r.width).toBe(200);
    expect(r.height).toBe(200);
  });
});

describe("cropInsets", () => {
  // Rests at 400x400, lands on a 200x200 origin: every viewport px of crop is
  // two of the image's own.
  const rest = { left: 0, top: 0, width: 400, height: 400 };
  const origin = { left: 100, top: 0, width: 200, height: 200 };

  it("measures the crop in the untransformed image's pixels", () => {
    const clip = { left: 100, top: 50, width: 200, height: 100 };
    expect(cropInsets(rest, origin, clip)).toEqual({ top: 100, right: 0, bottom: 100, left: 0 });
  });

  it("is all zeroes when the thumbnail shows the whole image", () => {
    const insets = cropInsets(rest, origin, origin);
    expect(insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(cropsAnything(insets)).toBe(false);
  });

  it("never asks for a crop wider than the image", () => {
    const offscreen = { left: 50, top: 0, width: 200, height: 200 };
    expect(cropInsets(rest, origin, offscreen).left).toBe(0);
  });
});

describe("cropMask", () => {
  /** Pull the (alpha, position) stops back out of a gradient string. */
  const stops = (mask: string) =>
    [...mask.matchAll(/rgba\(0,0,0,([\d.]+)\) (-?[\d.]+)px/g)].map((m) => ({
      alpha: parseFloat(m[1]),
      at: parseFloat(m[2]),
    }));

  // A 400px-wide image whose thumbnail shows only the middle 200px.
  const insets = { top: 0, right: 100, bottom: 0, left: 100 };
  const size = { width: 400, height: 300 };

  it("leaves the whole picture alone at the start", () => {
    for (const s of stops(cropMask(insets, size, 0, 40))) expect(s.alpha).toBe(1);
  });

  it("takes the crop to nothing and lands on a clean edge", () => {
    const s = stops(cropMask(insets, size, 1, 40));
    expect(s.map((x) => x.alpha)).toEqual([0, 0, 1, 1, 0, 0]);
    // No ramp left hanging outside the thumbnail's box.
    expect(s.map((x) => x.at)).toEqual([0, 100, 100, 300, 300, 400]);
  });

  it("fades where it stands rather than closing inward", () => {
    // The kept slice is the same slice throughout: it is the alpha outside it
    // that moves, not the boundary. (Skipping 0, where nothing is faded yet.)
    for (const p of [0.25, 0.5, 0.75, 1]) {
      const kept = stops(cropMask(insets, size, p, 40))
        .filter((x) => x.alpha === 1)
        .map((x) => x.at);
      expect(kept).toEqual([100, 300]);
    }
  });

  it("fades at an even rate", () => {
    const outer = [0, 0.25, 0.5, 0.75, 1].map((p) => stops(cropMask(insets, size, p, 40))[0].alpha);
    expect(outer).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it("softens the join, and closes the softening as the fade lands", () => {
    expect(stops(cropMask(insets, size, 0.5, 40))[1].at).toBe(80); // 20px ramp into the join at 100
    expect(stops(cropMask(insets, size, 1, 40))[1].at).toBe(100); // none left
  });

  it("runs down the other axis when that is the one that crops", () => {
    const mask = cropMask({ top: 50, right: 0, bottom: 50, left: 0 }, size, 0.5, 20);
    expect(mask.startsWith("linear-gradient(to bottom,")).toBe(true);
    const s = stops(mask);
    expect(s[s.length - 1].at).toBe(300); // the height, not the width
  });

  it("keeps the ramp inside the picture when the crop is all on one side", () => {
    for (const s of stops(cropMask({ top: 0, right: 200, bottom: 0, left: 0 }, size, 0.5, 80))) {
      expect(s.at).toBeGreaterThanOrEqual(0);
      expect(s.at).toBeLessThanOrEqual(400);
    }
  });
});

describe("cropFeather", () => {
  it("scales the softening with the strip being faded", () => {
    expect(cropFeather({ top: 0, right: 100, bottom: 0, left: 100 })).toBe(40);
    expect(cropFeather({ top: 25, right: 0, bottom: 25, left: 0 })).toBe(10);
  });
});

describe("cropFadeProgress", () => {
  it("holds the matched state on the side the hand-off happens", () => {
    // A collapse hands off at the end, so it is done fading before it gets
    // there; an expand hands off at the start, so it waits before starting.
    expect(cropFadeProgress(0.85, "collapse")).toBe(1);
    expect(cropFadeProgress(1, "collapse")).toBe(1);
    expect(cropFadeProgress(0, "expand")).toBe(1);
    expect(cropFadeProgress(0.15, "expand")).toBe(1);
  });

  it("ends where the flight does", () => {
    expect(cropFadeProgress(0, "collapse")).toBe(0);
    expect(cropFadeProgress(1, "expand")).toBe(0);
  });

  it("is monotone, and one direction is the other reversed", () => {
    for (let u = 0; u <= 1.0001; u += 0.05) {
      expect(cropFadeProgress(u, "expand")).toBeCloseTo(cropFadeProgress(1 - u, "collapse"));
    }
  });
});
