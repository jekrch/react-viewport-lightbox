import { describe, it, expect } from "vitest";
import { defaultHintText } from "./hint";

const base = { isTouchDevice: false, multiple: true, navigation: true, zoom: true };

describe("defaultHintText", () => {
  it("covers navigation, zoom and escape on desktop", () => {
    expect(defaultHintText(base)).toBe("← → or drag to navigate · scroll to zoom · esc to close");
  });

  it("adds the double-click shortcut for a single image", () => {
    expect(defaultHintText({ ...base, multiple: false })).toBe(
      "scroll to zoom · double-click to enlarge · esc to close",
    );
  });

  it("uses touch gestures and drops esc on touch devices", () => {
    expect(defaultHintText({ ...base, isTouchDevice: true })).toBe(
      "swipe to navigate · pinch to zoom",
    );
    expect(defaultHintText({ ...base, isTouchDevice: true, multiple: false })).toBe(
      "pinch to zoom · double-tap to enlarge",
    );
  });

  it("omits navigation when it's disabled and zoom when it's off", () => {
    expect(defaultHintText({ ...base, navigation: false })).toBe("scroll to zoom · esc to close");
    expect(defaultHintText({ ...base, zoom: false })).toBe(
      "← → or drag to navigate · esc to close",
    );
  });

  it("names swipe-to-close on touch only", () => {
    expect(defaultHintText({ ...base, isTouchDevice: true, dismiss: true })).toBe(
      "swipe to navigate · pinch to zoom · swipe down to close",
    );
    expect(defaultHintText({ ...base, dismiss: true })).toBe(
      "← → or drag to navigate · scroll to zoom · esc to close",
    );
  });

  it("returns null when nothing applies", () => {
    expect(
      defaultHintText({ isTouchDevice: true, multiple: false, navigation: true, zoom: false }),
    ).toBeNull();
  });
});
