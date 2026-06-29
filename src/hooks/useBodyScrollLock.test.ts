import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "./useBodyScrollLock";

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("useBodyScrollLock", () => {
  it("locks body overflow while locked and restores it on unmount", () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock when isLocked is false", () => {
    renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.overflow).toBe("");
  });

  it("reference-counts concurrent locks so the last unlock wins", () => {
    const a = renderHook(() => useBodyScrollLock(true));
    const b = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");

    a.unmount();
    // b still holds the lock.
    expect(document.body.style.overflow).toBe("hidden");

    b.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
