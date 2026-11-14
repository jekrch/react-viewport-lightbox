import { describe, it, expect } from "vitest";
import { cssDurationMs, parseCssTime } from "./cssTime";

describe("parseCssTime", () => {
  it("reads ms and s", () => {
    expect(parseCssTime("300ms")).toBe(300);
    expect(parseCssTime(" 0.35s ")).toBe(350);
  });

  it("rejects anything that isn't a time", () => {
    expect(parseCssTime("")).toBeNull();
    expect(parseCssTime("300")).toBeNull();
    expect(parseCssTime("fast")).toBeNull();
  });
});

describe("cssDurationMs", () => {
  it("reads the property as seen from the element, else falls back", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(cssDurationMs(el, "--rvl-backdrop-out", 250)).toBe(250);
    el.style.setProperty("--rvl-backdrop-out", "0.6s");
    expect(cssDurationMs(el, "--rvl-backdrop-out", 250)).toBe(600);
    expect(cssDurationMs(null, "--rvl-backdrop-out", 250)).toBe(250);
    el.remove();
  });
});
