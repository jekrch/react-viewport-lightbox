import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LazyImageViewer, preloadViewer } from "./lazy";
import type { ViewerItem } from "./types";

const items: ViewerItem[] = [
  { id: "a", src: "/a.jpg", alt: "Alpha" },
  { id: "b", src: "/b.jpg", alt: "Bravo" },
];

beforeAll(() => {
  // jsdom lacks these; the viewer touches them on mount.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe("lazy entry", () => {
  it("preloadViewer resolves, and repeat calls are safe", async () => {
    await expect(preloadViewer()).resolves.toBeUndefined();
    await expect(preloadViewer()).resolves.toBeUndefined();
  });

  it("renders the viewer with the same props once its code is loaded", async () => {
    render(
      <LazyImageViewer
        items={items}
        index={1}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        fallback={<p>loading viewer</p>}
      />,
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("loading viewer")).toBeNull();
  });
});
