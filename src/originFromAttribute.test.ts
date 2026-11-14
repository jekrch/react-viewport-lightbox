import { describe, it, expect, afterEach } from "vitest";
import { originFromAttribute } from "./originFromAttribute";
import type { ViewerItem } from "./types";

afterEach(() => {
  document.body.innerHTML = "";
});

const item = (id: string, data?: { slug: string }): ViewerItem<{ slug: string }> => ({
  id,
  src: `/${id}.jpg`,
  data,
});

function tile(attr: string, value: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(attr, value);
  document.body.appendChild(el);
  return el;
}

describe("originFromAttribute", () => {
  it("finds the tile carrying the item's id", () => {
    tile("data-photo-id", "a");
    const b = tile("data-photo-id", "b");
    expect(originFromAttribute("data-photo-id")(1, item("b"))).toBe(b);
  });

  it("returns null when no tile is on the page", () => {
    expect(originFromAttribute("data-photo-id")(0, item("zzz"))).toBeNull();
  });

  it("escapes ids that aren't selector-safe", () => {
    const el = tile("data-photo-id", 'we"ird\\id');
    expect(originFromAttribute("data-photo-id")(0, item('we"ird\\id'))).toBe(el);
  });

  it("takes a custom value and a search root", () => {
    const outside = tile("data-slug", "fern");
    const container = document.createElement("section");
    document.body.appendChild(container);
    const inside = document.createElement("div");
    inside.setAttribute("data-slug", "fern");
    container.appendChild(inside);

    const lookup = originFromAttribute<{ slug: string }>("data-slug", {
      value: (it) => it.data!.slug,
      root: () => container,
    });
    expect(lookup(0, item("x", { slug: "fern" }))).toBe(inside);
    expect(originFromAttribute("data-slug", { value: () => "fern" })(0, item("x"))).toBe(outside);
  });
});
