import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "./useBodyScrollLock";

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.documentElement.style.minHeight = "";
});

describe("useBodyScrollLock", () => {
  it("locks body overflow while locked and restores it on unmount", () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("pins the body in place while locked and unpins it on unmount", () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("0px");
    expect(document.body.style.width).toBe("100%");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
  });

  it("holds the root's scroll height while pinned and releases it on unmount", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => 5000,
    });
    try {
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(document.documentElement.style.minHeight).toBe("5000px");
      unmount();
      expect(document.documentElement.style.minHeight).toBe("");
    } finally {
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    }
  });

  it("restores a host's own root min-height on unmount", () => {
    document.documentElement.style.minHeight = "100%";
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    unmount();
    expect(document.documentElement.style.minHeight).toBe("100%");
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
