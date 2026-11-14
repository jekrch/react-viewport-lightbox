import { describe, expectTypeOf, it } from "vitest";
import type { ViewerContext, ViewerItem } from "./types";

// Type-level checks: `tsc` (npm run typecheck) is what enforces these.
describe("ViewerItem typing", () => {
  it("requires data once TData is named", () => {
    // @ts-expect-error data is required for a typed item
    const missing: ViewerItem<{ n: number }> = { id: "a", src: "/a.jpg" };
    const typed: ViewerItem<{ n: number }> = { id: "a", src: "/a.jpg", data: { n: 1 } };
    expectTypeOf(typed.data).toEqualTypeOf<{ n: number }>();
    expectTypeOf<ViewerContext<{ n: number }>["item"]["data"]>().toEqualTypeOf<{ n: number }>();
    void missing;
  });

  it("keeps data optional when TData is left out or includes undefined", () => {
    const plain: ViewerItem = { id: "a", src: "/a.jpg" };
    const maybe: ViewerItem<{ n: number } | undefined> = { id: "a", src: "/a.jpg" };
    expectTypeOf(maybe.data).toEqualTypeOf<{ n: number } | undefined>();
    void plain;
  });

  it("reserves kind for images only", () => {
    const image: ViewerItem = { id: "a", src: "/a.jpg", kind: "image" };
    // @ts-expect-error only "image" exists so far
    const video: ViewerItem = { id: "a", src: "/a.mp4", kind: "video" };
    void image;
    void video;
  });
});
