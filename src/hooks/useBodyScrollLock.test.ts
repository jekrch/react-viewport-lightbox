import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useBodyScrollLock,
  getScrollLockCompensation,
  SCROLLBAR_WIDTH_VAR,
} from "./useBodyScrollLock";

/**
 * Fakes a classic (space-taking) root scrollbar of `width` px that the lock's
 * `overflow: hidden` removes — unless `keepsSpace` (a stable gutter, or a
 * forced `overflow-y: scroll` on the root), where the page never widens.
 *
 * Models Chrome: the root's `clientWidth` grows once the scrollbar is hidden
 * EVEN under a stable gutter (`clientWidthGrows`, the default for a gutter),
 * while its laid-out width (`getBoundingClientRect`) only grows when the space
 * is really given back.
 */
function withScrollbar(width: number, keepsSpace = false, clientWidthGrows = true): () => void {
  const root = document.documentElement;
  const viewport = 1000;
  const hidden = () => document.body.style.overflow === "hidden";
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    get: () => (hidden() && (!keepsSpace || clientWidthGrows) ? viewport : viewport - width),
  });
  const rect = root.getBoundingClientRect;
  root.getBoundingClientRect = () => {
    const w = !keepsSpace && hidden() ? viewport : viewport - width;
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, width: w, height: 0 } as DOMRect;
  };
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: viewport,
  });
  return () => {
    delete (root as { clientWidth?: number }).clientWidth;
    root.getBoundingClientRect = rect;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
  };
}

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.documentElement.style.minHeight = "";
  document.documentElement.style.removeProperty(SCROLLBAR_WIDTH_VAR);
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
    expect(document.body.style.left).toBe("0px");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.left).toBe("");
    expect(document.body.style.right).toBe("");
  });

  it("holds the body's in-flow width by offsetting the vacated scrollbar", () => {
    const restore = withScrollbar(15);
    try {
      document.body.style.paddingRight = "2rem";
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(document.body.style.right).toBe("15px");
      // The body's own padding is left alone: the offset alone restores its width.
      expect(document.body.style.paddingRight).toBe("2rem");
      expect(getScrollLockCompensation()).toBe(15);
      unmount();
      expect(document.body.style.right).toBe("");
      expect(getScrollLockCompensation()).toBe(0);
    } finally {
      document.body.style.paddingRight = "";
      restore();
    }
  });

  it("publishes the compensated width as a root CSS variable while locked", () => {
    const restore = withScrollbar(17);
    try {
      const root = document.documentElement;
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("17px");
      unmount();
      expect(root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("");
    } finally {
      restore();
    }
  });

  it("leaves the variable unset when the scrollbar takes no space", () => {
    // Writing an inherited custom property on the root restyles the whole page,
    // so it's only written when there's a width to report.
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.documentElement.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("");
    expect(document.body.style.right).toBe("0px");
    unmount();
    expect(document.documentElement.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("");
  });

  it("skips compensation when the root keeps its scrollbar space while locked", () => {
    // scrollbar-gutter: stable, or overflow-y: scroll on <html>.
    const restore = withScrollbar(15, true);
    try {
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(document.body.style.right).toBe("0px");
      expect(document.documentElement.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("");
      expect(getScrollLockCompensation()).toBe(0);
      unmount();
    } finally {
      restore();
    }
  });

  it("ignores Chrome's grown clientWidth under a stable gutter", () => {
    // Regression: with `scrollbar-gutter: stable` the root's clientWidth jumps
    // by the scrollbar width once overflow is hidden, but the gutter stays
    // reserved. Compensating for it narrowed the body and shifted the page left.
    const restore = withScrollbar(15, true, true);
    try {
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(document.body.style.right).toBe("0px");
      expect(getScrollLockCompensation()).toBe(0);
      unmount();
    } finally {
      restore();
    }
  });

  it("keeps a fractional scrollbar width unrounded", () => {
    // A browser zoom gives the scrollbar a fractional width.
    const restore = withScrollbar(15.5);
    try {
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(document.body.style.right).toBe("15.5px");
      unmount();
    } finally {
      restore();
    }
  });

  it("restores a host's own value for the scrollbar variable on unlock", () => {
    const restore = withScrollbar(15);
    try {
      const root = document.documentElement;
      root.style.setProperty(SCROLLBAR_WIDTH_VAR, "3px");
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("15px");
      unmount();
      expect(root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("3px");
    } finally {
      restore();
    }
  });

  it("leaves a host's own value alone when there's nothing to compensate", () => {
    const root = document.documentElement;
    root.style.setProperty(SCROLLBAR_WIDTH_VAR, "3px");
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("3px");
    unmount();
    expect(root.style.getPropertyValue(SCROLLBAR_WIDTH_VAR)).toBe("3px");
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

  it("holds the scroll range before any layout read of the pinned body", () => {
    // Regression: measuring after pinning but before holding the range forced a
    // layout of a one-viewport document, clamping the scroll offset to 0.
    const restore = withScrollbar(15);
    const root = document.documentElement;
    const measure = root.getBoundingClientRect;
    const minHeightWhenPinned: string[] = [];
    root.getBoundingClientRect = () => {
      if (document.body.style.position === "fixed") minHeightWhenPinned.push(root.style.minHeight);
      return measure.call(root);
    };
    Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => 5000 });
    try {
      const { unmount } = renderHook(() => useBodyScrollLock(true));
      expect(minHeightWhenPinned.length).toBeGreaterThan(0);
      expect(minHeightWhenPinned.every((h) => h === "5000px")).toBe(true);
      unmount();
    } finally {
      delete (root as { scrollHeight?: number }).scrollHeight;
      restore();
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
