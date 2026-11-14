import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { useLightbox } from "./useLightbox";
import { useLightbox as useLazyLightbox } from "./lazy";
import * as prefetch from "./prefetch";
import type { UseLightboxOptions, LightboxTriggerHandlers } from "./lightbox";
import type { ViewerItem } from "./types";

const items: ViewerItem[] = [
  { id: "a", src: "/a.jpg", thumbnail: "/ta.jpg", alt: "Alpha" },
  { id: "b", src: "/b.jpg", thumbnail: "/tb.jpg", alt: "Bravo" },
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Gallery({
  options,
  handlers,
  onReady,
}: {
  options?: UseLightboxOptions;
  handlers?: LightboxTriggerHandlers;
  onReady?: (lb: ReturnType<typeof useLightbox>) => void;
}) {
  const lightbox = useLightbox(items, options);
  onReady?.(lightbox);
  return (
    <>
      {items.map((item, i) => (
        <button key={item.id} {...lightbox.triggerProps(i, handlers)}>
          <img src={item.thumbnail} alt={`tile ${item.alt}`} />
        </button>
      ))}
      {lightbox.viewer}
    </>
  );
}

const tile = (alt: string) => screen.getByAltText(`tile ${alt}`).closest("button")!;

describe("useLightbox", () => {
  it("opens the viewer on the clicked item", () => {
    render(<Gallery />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(tile("Bravo"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("Bravo")).toBeInTheDocument();
  });

  it("zooms from the trigger: the opening image is held for the entry zoom", () => {
    // A getOrigin is wired (the trigger), so the open gates the image hidden
    // until it decodes, then flies it out of the tile.
    render(<Gallery />);
    fireEvent.click(tile("Alpha"));
    const img = screen.getByAltText("Alpha");
    expect(img.style.opacity).toBe("0");
  });

  it("marks each trigger uniquely, also across lightboxes", () => {
    render(
      <>
        <Gallery />
        <Gallery />
      </>,
    );
    const marks = screen.getAllByRole("button").map((b) => b.getAttribute("data-rvl-trigger"));
    expect(new Set(marks).size).toBe(4);
  });

  it("leaves modified clicks to the browser", () => {
    render(<Gallery />);
    fireEvent.click(tile("Alpha"), { metaKey: true });
    fireEvent.click(tile("Alpha"), { ctrlKey: true });
    fireEvent.click(tile("Alpha"), { button: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("runs your handlers first, and preventDefault keeps it closed", () => {
    const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    const onPointerEnter = vi.fn();
    render(<Gallery handlers={{ onClick, onPointerEnter }} />);
    fireEvent.pointerEnter(tile("Alpha"));
    fireEvent.click(tile("Alpha"));
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prefetches the item on hover and press", () => {
    const spy = vi.spyOn(prefetch, "prefetchItem");
    render(<Gallery />);
    fireEvent.pointerEnter(tile("Bravo"));
    fireEvent.pointerDown(tile("Alpha"));
    expect(spy).toHaveBeenCalledWith(items[1]);
    expect(spy).toHaveBeenCalledWith(items[0]);
  });

  it("prefetches nothing with preload: false", () => {
    const spy = vi.spyOn(prefetch, "prefetchItem");
    render(<Gallery options={{ preload: false }} />);
    fireEvent.pointerEnter(tile("Bravo"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("passes viewer props through and still calls your callbacks", async () => {
    vi.useFakeTimers();
    // jsdom's Image has no decode(); the slide's commit waits on one.
    const proto = HTMLImageElement.prototype as unknown as { decode?: () => Promise<void> };
    proto.decode = () => Promise.resolve();
    try {
      const onIndexChange = vi.fn();
      render(<Gallery options={{ accent: "#ff5c8a", onIndexChange, loop: true }} />);
      fireEvent.click(tile("Alpha"));
      const dialog = screen.getByRole("dialog");
      expect(dialog.style.getPropertyValue("--rvl-accent")).toBe("#ff5c8a");
      fireEvent.keyDown(window, { key: "End" });
      // The jump slides first, then lands.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(onIndexChange).toHaveBeenCalledWith(1);
      expect(screen.getByAltText("Bravo")).toBeInTheDocument();
    } finally {
      delete proto.decode;
      vi.useRealTimers();
    }
  });

  it("calls your onClose once the viewer has closed", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<Gallery options={{ onClose }} />);
      fireEvent.click(tile("Alpha"));
      fireEvent.click(screen.getByLabelText("Close"));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("open() and close() drive it from outside", () => {
    let lb!: ReturnType<typeof useLightbox>;
    render(<Gallery onReady={(l) => (lb = l)} />);
    act(() => lb.open(1));
    expect(lb.isOpen).toBe(true);
    expect(lb.index).toBe(1);
    expect(screen.getByAltText("Bravo")).toBeInTheDocument();
    act(() => lb.close());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on a deep-linked item when history names a param", () => {
    window.history.replaceState(null, "", "/?photo=b");
    try {
      render(<Gallery options={{ history: { param: "photo" } }} />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByAltText("Bravo")).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("ignores a deep link to an unknown item", () => {
    window.history.replaceState(null, "", "/?photo=zzz");
    try {
      render(<Gallery options={{ history: { param: "photo" } }} />);
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("useLightbox from /lazy", () => {
  function LazyGallery({ options }: { options?: Parameters<typeof useLazyLightbox>[1] }) {
    const lightbox = useLazyLightbox(items, options);
    return (
      <>
        <button {...lightbox.triggerProps(1)}>open</button>
        {lightbox.viewer}
      </>
    );
  }

  it("loads the viewer and opens on the item", async () => {
    render(<LazyGallery options={{ fallback: <p>loading</p> }} />);
    fireEvent.click(screen.getByText("open"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("Bravo")).toBeInTheDocument();
  });

  it("preloads the viewer's code when the page is idle", () => {
    const idle = vi.fn((cb: IdleRequestCallback) => {
      void cb;
      return 1;
    });
    const original = window.requestIdleCallback;
    window.requestIdleCallback = idle as unknown as typeof window.requestIdleCallback;
    window.cancelIdleCallback ??= () => {};
    try {
      render(<LazyGallery />);
      expect(idle).toHaveBeenCalledTimes(1);
      cleanup();
      render(<LazyGallery options={{ preload: "intent" }} />);
      expect(idle).toHaveBeenCalledTimes(1);
    } finally {
      window.requestIdleCallback = original;
    }
  });
});
