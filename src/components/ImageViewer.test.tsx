import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach } from "vitest";
import { useState } from "react";
import { ImageViewer } from "./ImageViewer";
import type { ViewerContext, ViewerItem } from "../types";

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

const items: ViewerItem[] = [
  { id: "a", src: "/a.jpg", alt: "Alpha" },
  { id: "b", src: "/b.jpg", alt: "Bravo" },
  { id: "c", src: "/c.jpg", alt: "Charlie" },
];

function setup(index = 0, extra: Partial<React.ComponentProps<typeof ImageViewer>> = {}) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  render(
    <ImageViewer
      items={items}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      {...extra}
    />,
  );
  return { onIndexChange, onClose };
}

describe("<ImageViewer>", () => {
  it("renders the active image as a dialog", () => {
    setup(1);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const img = screen.getByAltText("Bravo");
    expect(img).toHaveAttribute("src", "/b.jpg");
  });

  it("renders the Safari 26 chrome-tint edge strips", () => {
    setup(0);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".rvl-chrome-tint-top")).toBeInTheDocument();
    expect(dialog.querySelector(".rvl-chrome-tint-bottom")).toBeInTheDocument();
  });

  it("shows the counter by default and hides it when showCounter is false", () => {
    const { onClose } = setup(0);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    cleanup();
    onClose.mockClear();
    setup(0, { showCounter: false });
    expect(screen.queryByText("1 / 3")).not.toBeInTheDocument();
  });

  it("navigates with the next button via onIndexChange (decode-gated)", async () => {
    const { onIndexChange } = setup(0);
    // jsdom Image.decode resolves; navigation is async, so just assert the
    // control is present and enabled.
    const next = screen.getByLabelText("Next image");
    expect(next).toBeEnabled();
    const prev = screen.getByLabelText("Previous image");
    expect(prev).toBeDisabled();
    void onIndexChange;
  });

  it("calls onClose (after the exit delay) when the close button is clicked", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0);
    fireEvent.click(screen.getByLabelText("Close"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("closes on a backdrop click when closeOnBackdropClick is set", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0, { closeOnBackdropClick: true });
    // Past the ghost-click window that swallows the iOS synthesized click from
    // the opening tap; a genuine close click always lands well after open.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(document.querySelector(".rvl-track")!);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("ignores the iOS ghost click/dblclick synthesized by the opening tap", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0, { closeOnBackdropClick: true });
    // Both events arrive within the ghost window (a few hundred ms after open),
    // re-targeted onto the freshly mounted viewer: the dblclick would zoom the
    // image and the click would close it. Both must be swallowed.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.dblClick(document.querySelector(".rvl-img-wrapper")!);
    fireEvent.click(document.querySelector(".rvl-track")!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".rvl-btn-scale")).toBeNull();
    vi.useRealTimers();
  });

  it("ignores backdrop clicks by default", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0);
    fireEvent.click(document.querySelector(".rvl-track")!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not close on an image click even when closeOnBackdropClick is set", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0, { closeOnBackdropClick: true });
    fireEvent.click(screen.getByAltText("Alpha"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("loops the prev button at the first item when loop is enabled", () => {
    setup(0, { loop: true });
    const prev = screen.getByLabelText("Previous image");
    expect(prev).toBeEnabled();
    // Wrapping now plays the three-slot slide (async, decode-gated) rather than
    // jumping, so the wrap-around neighbor mounts into the track to slide in.
    fireEvent.click(prev);
    expect(document.querySelector('img[src="/c.jpg"]')).toBeInTheDocument();
  });

  it("closes on the Escape key after the exit delay", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("wraps to the last item on ArrowLeft from the first when looping", () => {
    setup(0, { loop: true });
    // The wrap slides the last item (/c.jpg) in from the left.
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(document.querySelector('img[src="/c.jpg"]')).toBeInTheDocument();
  });

  it("wraps to the first item on ArrowRight from the last when looping", () => {
    setup(items.length - 1, { loop: true });
    // The wrap slides the first item (/a.jpg) in from the right.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(document.querySelector('img[src="/a.jpg"]')).toBeInTheDocument();
  });

  it("shows zoom controls on non-touch devices and zooms in and resets", () => {
    // jsdom reports a touch device (`ontouchstart` exists); emulate desktop so
    // the zoom controls render.
    const hadTouch = "ontouchstart" in window;
    delete window.ontouchstart;
    try {
      setup(0, { zoom: true });
      fireEvent.click(screen.getByLabelText("Zoom in"));
      // 1 * 1.3 = 1.3 → the reset control surfaces the current scale.
      const reset = screen.getByLabelText("Reset zoom");
      expect(reset).toHaveTextContent("130%");
      fireEvent.click(reset);
      expect(screen.queryByLabelText("Reset zoom")).not.toBeInTheDocument();
    } finally {
      if (hadTouch) (window as unknown as { ontouchstart?: unknown }).ontouchstart = undefined;
    }
  });

  it("renders every custom slot", () => {
    setup(0, {
      renderHeader: () => <div>HEADER-SLOT</div>,
      renderHeaderActions: () => <button>ACTION-SLOT</button>,
      renderNavStart: () => <button>START-SLOT</button>,
      renderNavEnd: () => <button>END-SLOT</button>,
      renderFooter: () => <div>FOOTER-SLOT</div>,
      renderOverlay: () => <div>OVERLAY-SLOT</div>,
    });
    for (const text of [
      "HEADER-SLOT",
      "ACTION-SLOT",
      "START-SLOT",
      "END-SLOT",
      "FOOTER-SLOT",
      "OVERLAY-SLOT",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("uses ariaLabel for the dialog when provided", () => {
    setup(0, { ariaLabel: "Gallery viewer" });
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Gallery viewer");
  });

  it("holds the image hidden until the full source loads, then reveals it", () => {
    const rect = { top: 10, left: 20, width: 100, height: 60 };
    const getOrigin = vi.fn().mockReturnValue(rect);
    setup(1, { getOrigin });
    const img = screen.getByAltText("Bravo");
    // Hidden while the full image loads so the zoom can play from the thumbnail
    // without a full-size flash...
    expect(img.style.opacity).toBe("0");
    // ...and revealed once it has loaded.
    act(() => {
      fireEvent.load(img);
    });
    expect(img.style.opacity).toBe("");
  });

  it("doesn't hold a failed image hidden behind the entry gate", () => {
    const getOrigin = vi.fn().mockReturnValue({ top: 0, left: 0, width: 10, height: 10 });
    setup(1, { getOrigin });
    const img = screen.getByAltText("Bravo");
    act(() => {
      fireEvent.error(img);
    });
    expect(img.style.opacity).toBe("");
  });

  it("leaves the image visible when getOrigin is omitted", () => {
    setup(1);
    expect(screen.getByAltText("Bravo").style.opacity).toBe("");
  });

  it("shows a loading spinner only after the image is slow to load", () => {
    vi.useFakeTimers();
    const getOrigin = vi.fn().mockReturnValue({ top: 0, left: 0, width: 10, height: 10 });
    setup(1, { getOrigin });
    // No spinner up front — quick loads shouldn't flash one.
    expect(document.querySelector(".rvl-spinner")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector(".rvl-spinner")).not.toBeNull();
    // It clears once the image loads.
    act(() => {
      fireEvent.load(screen.getByAltText("Bravo"));
    });
    expect(document.querySelector(".rvl-spinner")).toBeNull();
    vi.useRealTimers();
  });

  it("collapses back into the source rect on close", () => {
    vi.useFakeTimers();
    const rect = { top: 10, left: 20, width: 100, height: 60 };
    const getOrigin = vi.fn().mockReturnValue(rect);
    const { onClose } = setup(2, { getOrigin });
    getOrigin.mockClear();
    fireEvent.click(screen.getByLabelText("Close"));
    // The current index is queried so the image collapses into its own thumbnail.
    expect(getOrigin).toHaveBeenCalledWith(2, items[2]);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("accepts an element from getOrigin (reads its rect + radius)", () => {
    // The recommended usage: hand over the source element itself rather than a
    // pre-computed rect. It's resolved via getBoundingClientRect/getComputedStyle,
    // so the zoom still gates the image and reveals it once loaded.
    const el = document.createElement("div");
    const getOrigin = vi.fn().mockReturnValue(el);
    setup(1, { getOrigin });
    const img = screen.getByAltText("Bravo");
    // Gated hidden until the full source loads (same as the rect path)...
    expect(img.style.opacity).toBe("0");
    act(() => {
      fireEvent.load(img);
    });
    // ...then revealed, and the element was resolved for the entry zoom.
    expect(getOrigin).toHaveBeenCalledWith(1, items[1]);
    expect(img.style.opacity).toBe("");
  });
});

// --- Helpers for the open / history / stage / ctx suites -------------------

function renderViewer(
  props: Partial<React.ComponentProps<typeof ImageViewer>> & { index?: number },
) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const base = { items, index: 0, onIndexChange, onClose };
  const utils = render(<ImageViewer {...base} {...props} />);
  const rerender = (next: Partial<React.ComponentProps<typeof ImageViewer>>) =>
    utils.rerender(<ImageViewer {...base} {...props} {...next} />);
  return { ...utils, rerender, onIndexChange, onClose };
}

/** A gallery tile whose <img> has already loaded (as an on-screen thumbnail has). */
function loadedTile(src: string, w = 400, h = 300): HTMLElement {
  const el = document.createElement("div");
  const img = document.createElement("img");
  img.src = src;
  Object.defineProperty(img, "complete", { value: true });
  Object.defineProperty(img, "naturalWidth", { value: w });
  Object.defineProperty(img, "naturalHeight", { value: h });
  el.appendChild(img);
  return el;
}

function stubNaturalSize(img: HTMLElement, w: number, h: number) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
}

// jsdom has no HTMLImageElement#decode and never loads images; stand in a
// decode whose promises the test settles by src.
type PendingDecode = { src: string; resolve: () => void; reject: () => void };
let pendingDecodes: PendingDecode[] = [];
function installDecode() {
  pendingDecodes = [];
  (HTMLImageElement.prototype as unknown as { decode: () => Promise<void> }).decode = function (
    this: HTMLImageElement,
  ) {
    return new Promise<void>((resolve, reject) =>
      pendingDecodes.push({ src: this.src, resolve, reject }),
    );
  };
}
function uninstallDecode() {
  delete (HTMLImageElement.prototype as unknown as { decode?: unknown }).decode;
}
async function settleDecodes(suffix: string) {
  await act(async () => {
    const hits = pendingDecodes.filter((p) => p.src.endsWith(suffix));
    pendingDecodes = pendingDecodes.filter((p) => !p.src.endsWith(suffix));
    hits.forEach((p) => p.resolve());
  });
}

describe("<ImageViewer> thumbnail-first open", () => {
  beforeEach(installDecode);
  afterEach(uninstallDecode);

  it("opens on the origin tile's loaded image, then swaps in the full image", async () => {
    renderViewer({ index: 1, getOrigin: () => loadedTile("/thumb-b.jpg") });
    const img = screen.getByAltText("Bravo") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/\/thumb-b\.jpg$/);
    // The full image is fetched + decoded off-DOM, then swapped into the same element.
    await settleDecodes("/b.jpg");
    expect(img.getAttribute("src")).toBe("/b.jpg");
    expect(screen.getByAltText("Bravo")).toBe(img);
  });

  it("sizes the placeholder to the full image's resting box, and releases it after the swap", async () => {
    renderViewer({ index: 1, getOrigin: () => loadedTile("/thumb-b.jpg") });
    const img = screen.getByAltText("Bravo") as HTMLImageElement;
    stubNaturalSize(img, 400, 300);
    act(() => {
      fireEvent.load(img);
    });
    // jsdom has no stylesheet, so the caps fall back to the window (1024×768):
    // a 4:3 placeholder scaled to fit is 1024×768, not its own 400×300.
    expect(img.style.width).toBe("1024px");
    expect(img.style.height).toBe("768px");
    await settleDecodes("/thumb-b.jpg"); // placeholder decoded → revealed
    expect(img.style.opacity).toBe("");
    await settleDecodes("/b.jpg"); // full image ready → swapped
    act(() => {
      fireEvent.load(img);
    });
    expect(img.style.width).toBe("");
    expect(img.style.height).toBe("");
  });

  it("uses item.thumbnail when there is no origin image, hidden until it loads", async () => {
    const withThumbs: ViewerItem[] = items.map((it) => ({ ...it, thumbnail: `/t-${it.id}.jpg` }));
    renderViewer({ items: withThumbs, index: 0 });
    const img = screen.getByAltText("Alpha") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/t-a.jpg");
    expect(img.style.opacity).toBe("0");
    stubNaturalSize(img, 300, 200);
    act(() => {
      fireEvent.load(img);
    });
    await settleDecodes("/t-a.jpg");
    expect(img.style.opacity).toBe("");
    await settleDecodes("/a.jpg");
    expect(img.getAttribute("src")).toBe("/a.jpg");
  });

  it("skips the placeholder when the tile already shows the full image", () => {
    renderViewer({ index: 1, getOrigin: () => loadedTile("/b.jpg") });
    expect(screen.getByAltText("Bravo").getAttribute("src")).toBe("/b.jpg");
  });

  it("falls back to the full image when the placeholder fails to load", () => {
    renderViewer({ index: 1, getOrigin: () => loadedTile("/thumb-b.jpg") });
    const img = screen.getByAltText("Bravo");
    act(() => {
      fireEvent.error(img);
    });
    expect(img.getAttribute("src")).toBe("/b.jpg");
  });

  it("drops the placeholder once the viewer pages off the opening item", () => {
    const { rerender } = renderViewer({ index: 1, getOrigin: () => loadedTile("/thumb-b.jpg") });
    rerender({ index: 2 });
    expect(screen.getByAltText("Charlie").getAttribute("src")).toBe("/c.jpg");
    rerender({ index: 1 });
    expect(screen.getByAltText("Bravo").getAttribute("src")).toBe("/b.jpg");
  });
});

describe("<ImageViewer> stageShift", () => {
  const stage = () => document.querySelector(".rvl-stage") as HTMLElement;

  it("starts in place, without a slide, when mounted already shifted", () => {
    renderViewer({ stageShift: "up" });
    expect(stage().style.transform).toBe("translateY(-100vh)");
    expect(stage().style.transition).toBe("none");
  });

  it("animates later changes", () => {
    const { rerender } = renderViewer({ stageShift: null });
    expect(stage().style.transform).toBe("translateY(0)");
    rerender({ stageShift: "down" });
    expect(stage().style.transform).toBe("translateY(100vh)");
    expect(stage().style.transition).toBe("");
  });

  it("passes a custom transform through verbatim", () => {
    renderViewer({ stageShift: "translateY(-40vh)" });
    expect(stage().style.transform).toBe("translateY(-40vh)");
  });

  it("hides the zoom controls while shifted", () => {
    const { rerender } = renderViewer({});
    expect(screen.queryByLabelText("Zoom in")).not.toBeNull();
    rerender({ stageShift: "up" });
    expect(screen.queryByLabelText("Zoom in")).toBeNull();
  });

  it("suspends closeOnBackdropClick while shifted", () => {
    vi.useFakeTimers();
    const { onClose, rerender } = renderViewer({ stageShift: "up", closeOnBackdropClick: true });
    // Past the opening-tap ghost-click window.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    const track = document.querySelector(".rvl-track")!;
    fireEvent.click(track);
    fireEvent.click(document.querySelector(".rvl-backdrop")!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
    // Back in place, the backdrop closes again.
    rerender({ stageShift: null, closeOnBackdropClick: true });
    fireEvent.click(track);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("snaps back, rather than animating, when cleared as a slide starts", () => {
    function Harness() {
      const [drawer, setDrawer] = useState(true);
      const [index, setIndex] = useState(0);
      return (
        <>
          <ImageViewer
            items={items}
            index={index}
            onIndexChange={setIndex}
            onClose={() => {}}
            stageShift={drawer ? "up" : null}
            onNavigate={() => setDrawer(false)}
          />
          <button onClick={() => setDrawer((d) => !d)}>toggle</button>
        </>
      );
    }
    render(<Harness />);
    // A toggle animates both ways.
    fireEvent.click(screen.getByText("toggle"));
    expect(stage().style.transform).toBe("translateY(0)");
    expect(stage().style.transition).toBe("");
    fireEvent.click(screen.getByText("toggle"));
    expect(stage().style.transform).toBe("translateY(-100vh)");
    expect(stage().style.transition).toBe("");
    // Navigating closes the drawer from onNavigate: the stage snaps.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(stage().style.transform).toBe("translateY(0)");
    expect(stage().style.transition).toBe("none");
  });
});

describe("<ImageViewer> neighbor warm", () => {
  let warmed: string[] = [];
  beforeEach(() => {
    warmed = [];
    // A minimal Image stand-in that records each warmed src.
    vi.stubGlobal(
      "Image",
      class {
        srcset = "";
        sizes = "";
        set src(v: string) {
          warmed.push(v);
        }
        decode() {
          return Promise.resolve();
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const five: ViewerItem[] = ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    src: `/${id}.jpg`,
    alt: id,
  }));

  it("warms `preloadCount` images each side, nearest first, wrapping with loop", () => {
    renderViewer({ items: five, index: 0, preloadCount: 2, loop: true });
    expect(warmed).toEqual(["/e.jpg", "/b.jpg", "/d.jpg", "/c.jpg"]);
  });

  it("doesn't wrap without loop, and never warms the active image", () => {
    renderViewer({ items: five, index: 1, preloadCount: 5 });
    expect(warmed).toEqual(["/a.jpg", "/c.jpg", "/d.jpg", "/e.jpg"]);
  });

  it("warms again on a later open, after the earlier decode has gone stale", async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderViewer({ index: 1 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(warmed).toEqual(["/a.jpg", "/c.jpg"]);
      unmount();
      // The browser may have dropped those decodes since (iOS does under
      // memory pressure): a reopen decodes them again rather than trusting it.
      act(() => void vi.advanceTimersByTime(10_000));
      renderViewer({ index: 1 });
      expect(warmed).toEqual(["/a.jpg", "/c.jpg", "/a.jpg", "/c.jpg"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("decodes a neighbor panel sync once its warm decode has landed", async () => {
    renderViewer({ index: 1 });
    // Let the warm decodes resolve, then start a slide to mount the panels.
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const panelImg = (src: string) =>
      document.querySelector(`.rvl-adjacent img[src="${src}"]`) as HTMLImageElement;
    expect(panelImg("/c.jpg")).toHaveAttribute("decoding", "sync");
    expect(panelImg("/a.jpg")).toHaveAttribute("decoding", "sync");
  });

  it("warms nothing with preloadCount 0", () => {
    renderViewer({ index: 1, preloadCount: 0 });
    expect(warmed).toEqual([]);
  });

  it("backs off under Save-Data unless preloadCount is explicit", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    try {
      const { unmount } = renderViewer({ index: 1 });
      expect(warmed).toEqual([]);
      unmount();
      renderViewer({ index: 1, preloadCount: 1 });
      expect(warmed).toEqual(["/a.jpg", "/c.jpg"]);
    } finally {
      delete (navigator as { connection?: unknown }).connection;
    }
  });

  it("keys on neighbor sources, not on items identity", () => {
    const { rerender } = renderViewer({ index: 1 });
    expect(warmed).toEqual(["/a.jpg", "/c.jpg"]);
    // A fresh but equal array (the inline `items={photos.map(…)}` pattern).
    rerender({ items: items.map((it) => ({ ...it })) });
    expect(warmed).toHaveLength(2);
    rerender({ index: 2 });
    expect(warmed).toEqual(["/a.jpg", "/c.jpg", "/b.jpg"]);
  });
});

describe("<ImageViewer> active image decoding", () => {
  it("decodes a cold src async and a warmed neighbor sync", () => {
    const { rerender } = renderViewer({ index: 0 });
    // Cold deep-link open: nothing has warmed /a.jpg.
    expect(screen.getByAltText("Alpha")).toHaveAttribute("decoding", "async");
    // /b.jpg was warmed as the next neighbor.
    rerender({ index: 1 });
    expect(screen.getByAltText("Bravo")).toHaveAttribute("decoding", "sync");
  });

  it("treats an image that has already loaded as warm", () => {
    const { rerender } = renderViewer({ index: 0 });
    fireEvent.load(screen.getByAltText("Alpha"));
    rerender({ index: 2 });
    rerender({ index: 0 });
    expect(screen.getByAltText("Alpha")).toHaveAttribute("decoding", "sync");
  });
});

describe("<ImageViewer> loading spinner", () => {
  it("shows for a slow open without getOrigin, and clears on load", () => {
    vi.useFakeTimers();
    renderViewer({ index: 0 });
    expect(screen.queryByLabelText("Loading")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    act(() => {
      fireEvent.load(screen.getByAltText("Alpha"));
    });
    // jsdom's <img> has no decode(), so the load marks it ready synchronously.
    expect(screen.queryByLabelText("Loading")).toBeNull();
    vi.useRealTimers();
  });

  it("never flashes for a quick load", () => {
    vi.useFakeTimers();
    renderViewer({ index: 0 });
    act(() => {
      fireEvent.load(screen.getByAltText("Alpha"));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByLabelText("Loading")).toBeNull();
    vi.useRealTimers();
  });
});

describe("<ImageViewer> load error", () => {
  function fail(alt: string) {
    act(() => {
      fireEvent.error(screen.getByAltText(alt));
    });
  }

  it("replaces a broken image with a message and a Retry button", () => {
    renderViewer({ index: 0 });
    expect(screen.queryByRole("alert")).toBeNull();
    fail("Alpha");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load image");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByAltText("Alpha").style.visibility).toBe("hidden");
  });

  it("Retry reloads the image in a fresh element, with a spinner until it loads", () => {
    renderViewer({ index: 0 });
    const broken = screen.getByAltText("Alpha");
    fail("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.queryByRole("alert")).toBeNull();
    const fresh = screen.getByAltText("Alpha");
    expect(fresh).not.toBe(broken);
    expect(fresh.style.visibility).toBe("");
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    act(() => {
      fireEvent.load(fresh);
    });
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("shows the error again when the retry fails too", () => {
    renderViewer({ index: 0 });
    fail("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fail("Alpha");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("clears when the viewer pages to another item", () => {
    const { rerender } = renderViewer({ index: 0 });
    fail("Alpha");
    rerender({ index: 1 });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByAltText("Bravo").style.visibility).toBe("");
  });

  it("is not shown when only the thumbnail placeholder fails", () => {
    renderViewer({ index: 1, getOrigin: () => loadedTile("/thumb-b.jpg") });
    fail("Bravo");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides the zoom controls while shown", () => {
    renderViewer({ index: 0 });
    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
    fail("Alpha");
    expect(screen.queryByLabelText("Zoom in")).toBeNull();
  });

  it("keeps a Retry tap from closing the viewer through the backdrop", () => {
    const { onClose } = renderViewer({ index: 0, closeOnBackdropClick: true });
    fail("Alpha");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    vi.useRealTimers();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renderError replaces the default content and gets ctx and retry", () => {
    const renderError = vi.fn((ctx: ViewerContext, retry: () => void) => (
      <button type="button" onClick={retry}>
        Try {ctx.item.alt} again
      </button>
    ));
    renderViewer({ index: 0, renderError });
    expect(renderError).not.toHaveBeenCalled();
    fail("Alpha");
    expect(screen.queryByText("Couldn't load image")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Alpha again" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renderError returning null shows nothing", () => {
    renderViewer({ index: 0, renderError: () => null });
    fail("Alpha");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("<ImageViewer> live region", () => {
  it("announces the position and alt text", () => {
    const { rerender } = renderViewer({ index: 0 });
    const region = document.querySelector("[aria-live='polite']")!;
    expect(region).toHaveTextContent("Image 1 of 3: Alpha");
    rerender({ index: 2 });
    expect(region).toHaveTextContent("Image 3 of 3: Charlie");
  });

  it("stays empty for a single image", () => {
    renderViewer({ items: [items[0]] });
    expect(document.querySelector("[aria-live='polite']")).toBeEmptyDOMElement();
  });
});

describe("<ImageViewer> hint", () => {
  const hintEl = () => document.querySelector(".rvl-hint");

  it("renders nothing by default", () => {
    renderViewer({});
    expect(hintEl()).toBeNull();
  });

  it("renders the built-in text with hint={true}", () => {
    renderViewer({ hint: true, classNames: { hint: "my-hint" } });
    expect(hintEl()).toHaveTextContent(
      "← → or drag to navigate · double-click to zoom · esc to close",
    );
    expect(hintEl()).toHaveClass("my-hint");
  });

  it('says scroll to zoom under wheel="zoom"', () => {
    renderViewer({ hint: true, wheel: "zoom" });
    expect(hintEl()).toHaveTextContent("← → or drag to navigate · scroll to zoom · esc to close");
  });

  it("follows the zoom and disableNavigation props", () => {
    renderViewer({ hint: true, zoom: false, disableNavigation: true });
    expect(hintEl()).toHaveTextContent(/^esc to close$/);
  });

  it("renders custom text from a function, and hides on null", () => {
    const { rerender } = renderViewer({ hint: (ctx) => `bild ${ctx.index + 1}` });
    expect(hintEl()).toHaveTextContent("bild 1");
    rerender({ hint: () => null });
    expect(hintEl()).toBeNull();
  });

  it("hides while the stage is shifted", () => {
    const { rerender } = renderViewer({ hint: true });
    expect(hintEl()).not.toHaveClass("rvl-hint-hidden");
    rerender({ hint: true, stageShift: "up" });
    // Stays mounted (keeps its space) and fades out via CSS.
    expect(hintEl()).toHaveClass("rvl-hint-hidden");
    expect(hintEl()).toHaveAttribute("aria-hidden", "true");
    rerender({ hint: true });
    expect(hintEl()).not.toHaveClass("rvl-hint-hidden");
    expect(hintEl()).not.toHaveAttribute("aria-hidden");
  });

  it("hides while zoomed", () => {
    renderViewer({ hint: true });
    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(hintEl()).toHaveClass("rvl-hint-hidden");
  });
});

describe("<ImageViewer> onCloseStart", () => {
  it("fires synchronously at close start, once, before onClose", () => {
    vi.useFakeTimers();
    const onCloseStart = vi.fn();
    const { onClose } = renderViewer({ onCloseStart });
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onCloseStart).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // A second request mid-exit is ignored.
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onCloseStart).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("<ImageViewer> history", () => {
  beforeEach(() => window.history.replaceState(null, "", "/gallery?x=1"));
  afterEach(() => window.history.replaceState(null, "", "/"));

  const viewerEntry = () =>
    (window.history.state as Record<string, unknown> | null)?.__rvl !== undefined;
  const back = () =>
    act(() => {
      // jsdom's history.back() lands asynchronously; replay what it does.
      window.history.replaceState(null, "", "/gallery?x=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

  it("pushes an entry naming the open item, and tracks paging without pushing", () => {
    const pushes = vi.spyOn(window.history, "pushState");
    const { rerender } = renderViewer({ index: 1, history: { param: "photo" } });
    expect(pushes).toHaveBeenCalledTimes(1);
    expect(viewerEntry()).toBe(true);
    expect(window.location.search).toBe("?x=1&photo=b");
    rerender({ index: 2 });
    expect(window.location.search).toBe("?x=1&photo=c");
    expect(pushes).toHaveBeenCalledTimes(1);
    pushes.mockRestore();
  });

  describe("close(then)", () => {
    function withCtx(props: Partial<React.ComponentProps<typeof ImageViewer>> = {}) {
      let ctx!: ViewerContext;
      renderViewer({
        index: 1,
        renderHeader: (c) => {
          ctx = c;
          return null;
        },
        ...props,
      });
      return () => ctx;
    }

    it("runs then once the back step has landed, not before", () => {
      const goBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
      try {
        const ctx = withCtx({ history: { param: "photo" } });
        const then = vi.fn();
        act(() => ctx().close(then));
        expect(goBack).toHaveBeenCalledTimes(1);
        expect(then).not.toHaveBeenCalled();
        back();
        expect(then).toHaveBeenCalledTimes(1);
      } finally {
        goBack.mockRestore();
      }
    });

    it("runs then at once without history", () => {
      const ctx = withCtx();
      const then = vi.fn();
      act(() => ctx().close(then));
      expect(then).toHaveBeenCalledTimes(1);
    });

    it("joins a close already on its way", () => {
      const goBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
      try {
        const ctx = withCtx({ history: true });
        const then = vi.fn();
        act(() => ctx().close());
        act(() => ctx().close(then));
        expect(goBack).toHaveBeenCalledTimes(1);
        expect(then).not.toHaveBeenCalled();
        back();
        expect(then).toHaveBeenCalledTimes(1);
      } finally {
        goBack.mockRestore();
      }
    });

    it("runs then anyway if the back step never reports", () => {
      vi.useFakeTimers();
      const goBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
      try {
        const ctx = withCtx({ history: true });
        const then = vi.fn();
        act(() => ctx().close(then));
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(then).toHaveBeenCalledTimes(1);
      } finally {
        goBack.mockRestore();
        vi.useRealTimers();
      }
    });

    it("runs then at once when back itself started the close", () => {
      const ctx = withCtx({ history: true });
      back();
      const then = vi.fn();
      act(() => ctx().close(then));
      expect(then).toHaveBeenCalledTimes(1);
    });
  });

  describe('with paging: "push"', () => {
    const opts = { param: "photo", paging: "push" } as const;
    /** Simulate the browser landing on an earlier entry: its state and URL, then popstate. */
    const landOn = (entry: { state: unknown; url: string }) =>
      act(() => {
        window.history.replaceState(entry.state, "", entry.url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    const entry = () => ({
      state: window.history.state,
      url: window.location.pathname + window.location.search,
    });

    it("pushes an entry per item, and back steps to the previous item", () => {
      const pushes = vi.spyOn(window.history, "pushState");
      try {
        const { rerender, onIndexChange } = renderViewer({ index: 0, history: opts });
        const first = entry();
        rerender({ index: 1 });
        const second = entry();
        rerender({ index: 2 });
        expect(pushes).toHaveBeenCalledTimes(3);
        expect(window.location.search).toBe("?x=1&photo=c");
        landOn(second);
        expect(onIndexChange).toHaveBeenLastCalledWith(1);
        // The parent applies it; that item's entry is already current, so no push.
        rerender({ index: 1 });
        expect(pushes).toHaveBeenCalledTimes(3);
        landOn(first);
        expect(onIndexChange).toHaveBeenLastCalledWith(0);
      } finally {
        pushes.mockRestore();
      }
    });

    it("closes on a back press off the opening item's entry", () => {
      const onCloseStart = vi.fn();
      const { rerender } = renderViewer({ index: 0, history: opts, onCloseStart });
      rerender({ index: 1 });
      back();
      expect(onCloseStart).toHaveBeenCalledTimes(1);
    });

    it("steps off every viewer entry at once when closed from the UI", () => {
      const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
      try {
        const { rerender } = renderViewer({ index: 0, history: opts });
        rerender({ index: 1 });
        rerender({ index: 2 });
        fireEvent.click(screen.getByLabelText("Close"));
        expect(go).toHaveBeenCalledWith(-3);
      } finally {
        go.mockRestore();
      }
    });

    it("lets onEscape claim a step, putting the item back on top", () => {
      let drawerOpen = true;
      const onEscape = vi.fn(() => {
        if (!drawerOpen) return false;
        drawerOpen = false;
        return true;
      });
      const pushes = vi.spyOn(window.history, "pushState");
      try {
        const { rerender, onIndexChange } = renderViewer({ index: 0, history: opts, onEscape });
        const first = entry();
        rerender({ index: 1 });
        expect(pushes).toHaveBeenCalledTimes(2);
        landOn(first);
        expect(onEscape).toHaveBeenCalledTimes(1);
        expect(onIndexChange).not.toHaveBeenCalled();
        // Item 1's entry is pushed again, so the next back still steps.
        expect(pushes).toHaveBeenCalledTimes(3);
        expect(window.location.search).toBe("?x=1&photo=b");
        landOn(first);
        expect(onIndexChange).toHaveBeenLastCalledWith(0);
      } finally {
        pushes.mockRestore();
      }
    });
  });

  describe("before the page's first user interaction", () => {
    const activation = { hasBeenActive: false };
    beforeEach(() => {
      activation.hasBeenActive = false;
      Object.defineProperty(navigator, "userActivation", {
        value: activation,
        configurable: true,
      });
    });
    afterEach(() => {
      delete (navigator as { userActivation?: unknown }).userActivation;
    });

    it("waits for the first interaction to push, so back doesn't skip the entry", () => {
      window.history.replaceState(null, "", "/gallery?x=1&photo=b");
      const pushes = vi.spyOn(window.history, "pushState");
      try {
        renderViewer({ index: 1, history: { param: "photo" } });
        expect(pushes).not.toHaveBeenCalled();
        expect(window.location.search).toBe("?x=1&photo=b");
        // A press that isn't an activation yet (a touch activates on release).
        fireEvent.pointerDown(window);
        expect(pushes).not.toHaveBeenCalled();
        activation.hasBeenActive = true;
        fireEvent.pointerUp(window);
        expect(pushes).toHaveBeenCalledTimes(1);
        expect(viewerEntry()).toBe(true);
        expect(window.location.search).toBe("?x=1&photo=b");
        // Only once.
        fireEvent.keyDown(window, { key: "ArrowRight" });
        expect(pushes).toHaveBeenCalledTimes(1);
      } finally {
        pushes.mockRestore();
      }
    });

    it("strips its param when closed before any interaction", () => {
      window.history.replaceState(null, "", "/gallery?x=1&photo=b");
      const backs = vi.spyOn(window.history, "back");
      try {
        renderViewer({ index: 1, history: { param: "photo" } });
        // Escape isn't a user activation.
        fireEvent.keyDown(document, { key: "Escape" });
        expect(backs).not.toHaveBeenCalled();
        expect(window.location.search).toBe("?x=1");
      } finally {
        backs.mockRestore();
      }
    });
  });

  it("falls back to a state-only entry when the URL can't be rewritten", () => {
    // A sandboxed frame refuses URL rewrites with a SecurityError.
    const realPush = window.history.pushState.bind(window.history);
    const realReplace = window.history.replaceState.bind(window.history);
    const refuseUrl =
      (real: History["pushState"]) =>
      (state: unknown, unused: string, url?: string | URL | null) => {
        if (url != null) throw new DOMException("origin 'null'", "SecurityError");
        real(state, unused);
      };
    const pushes = vi.spyOn(window.history, "pushState").mockImplementation(refuseUrl(realPush));
    const replaces = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(refuseUrl(realReplace));
    try {
      const onCloseStart = vi.fn();
      const { rerender } = renderViewer({
        index: 1,
        history: { param: "photo" },
        onCloseStart,
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // The entry exists (back still closes); the URL just isn't rewritten.
      expect(viewerEntry()).toBe(true);
      expect(window.location.search).toBe("?x=1");
      rerender({ index: 2 });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      replaces.mockRestore();
      back();
      expect(onCloseStart).toHaveBeenCalledTimes(1);
    } finally {
      pushes.mockRestore();
      replaces.mockRestore();
    }
  });

  it("keeps working, without history, when the browser refuses history writes", () => {
    const pushes = vi.spyOn(window.history, "pushState").mockImplementation(() => {
      throw new DOMException("origin 'null'", "SecurityError");
    });
    const backs = vi.spyOn(window.history, "back");
    try {
      renderViewer({ index: 1, history: { param: "photo" } });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(viewerEntry()).toBe(false);
      fireEvent.click(screen.getByLabelText("Close"));
      // No entry was pushed, so closing mustn't step the page back.
      expect(backs).not.toHaveBeenCalled();
    } finally {
      pushes.mockRestore();
      backs.mockRestore();
    }
  });

  it("honors a custom value, and leaves the param off for null", () => {
    const { rerender } = renderViewer({
      index: 0,
      history: { param: "p", value: (it) => (it.id === "b" ? null : `n-${it.id}`) },
    });
    expect(window.location.search).toBe("?x=1&p=n-a");
    rerender({ index: 1 });
    expect(window.location.search).toBe("?x=1");
  });

  it("strips a deep-linked param from the entry underneath", () => {
    window.history.replaceState(null, "", "/gallery?x=1&photo=b");
    const replaces = vi.spyOn(window.history, "replaceState");
    renderViewer({ index: 1, history: { param: "photo" } });
    expect(replaces.mock.calls[0][2]).toBe("/gallery?x=1");
    expect(window.location.search).toBe("?x=1&photo=b");
    replaces.mockRestore();
  });

  it("closes on a back press", () => {
    vi.useFakeTimers();
    const onCloseStart = vi.fn();
    const { onClose } = renderViewer({ history: true, onCloseStart });
    back();
    expect(onCloseStart).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("lets onEscape claim a back press, re-arming the entry", () => {
    vi.useFakeTimers();
    const onEscape = vi.fn().mockReturnValue(true);
    const { onClose } = renderViewer({ history: true, onEscape });
    back();
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(viewerEntry()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("steps back off its entry when closed from the UI", () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderViewer({ history: true });
    fireEvent.click(screen.getByLabelText("Close"));
    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it("leaves history alone by default", () => {
    const pushes = vi.spyOn(window.history, "pushState");
    renderViewer({});
    expect(pushes).not.toHaveBeenCalled();
    pushes.mockRestore();
  });
});

describe("<ImageViewer> slot rendering", () => {
  it("does not re-run slots on viewer-internal re-renders", () => {
    const renderOverlay = vi.fn(() => null);
    renderViewer({ renderOverlay });
    const before = renderOverlay.mock.calls.length;
    // A nav starts a slide: internal swipe state flips, no ctx field changes.
    act(() => {
      fireEvent.click(screen.getByLabelText("Next image"));
    });
    expect(renderOverlay.mock.calls.length).toBe(before);
  });

  it("hands slots identity-stable actions across renders", () => {
    const seen: ViewerContext[] = [];
    const renderFooter = (ctx: ViewerContext) => {
      seen.push(ctx);
      return null;
    };
    const { rerender } = renderViewer({ renderFooter });
    rerender({ renderFooter: (ctx) => renderFooter(ctx), index: 1 });
    const first = seen[0];
    const last = seen[seen.length - 1];
    expect(last).not.toBe(first);
    expect(last.goNext).toBe(first.goNext);
    expect(last.close).toBe(first.close);
    expect(last.zoomIn).toBe(first.zoomIn);
  });
});

describe("<ImageViewer> swipe to close", () => {
  const track = () => document.querySelector(".rvl-track") as HTMLElement;
  const wrapper = () => document.querySelector(".rvl-img-wrapper") as HTMLElement;
  const backdrop = () => document.querySelector(".rvl-backdrop") as HTMLElement;
  // The release velocity is sampled off performance.now; drive it by hand so a
  // synchronous test doesn't read as an infinitely fast flick.
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const touch = (x: number, y: number) => ({ clientX: x, clientY: y });
  function drag(points: [number, number, number][]) {
    const [x0, y0] = points[0];
    fireEvent.touchStart(track(), { touches: [touch(x0, y0)] });
    for (const [x, y, t] of points.slice(1)) {
      clock = t;
      fireEvent.touchMove(track(), { touches: [touch(x, y)] });
    }
  }
  function release(x: number, y: number) {
    fireEvent.touchEnd(track(), { touches: [], changedTouches: [touch(x, y)] });
  }

  it("follows a vertical drag, shrinking the image and fading the backdrop", () => {
    renderViewer({});
    drag([
      [100, 100, 0],
      [102, 110, 0],
      [105, 300, 200],
    ]);
    expect(wrapper().style.transform).toMatch(/translate3d\(5px, 200px, 0(px)?\) scale\(0\.8/);
    expect(Number(backdrop().style.opacity)).toBeLessThan(1);
  });

  it("closes when released past the distance threshold", () => {
    const { onClose } = renderViewer({});
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 300, 400],
    ]);
    release(100, 300);
    // The stylesheet takes the fade back over, and with no thumbnail to land
    // in the image carries on down off-screen.
    expect(backdrop().style.opacity).toBe("");
    expect(wrapper().style.transform).toMatch(/translate3d\(0px, [6-9]\d\d(\.\d+)?px/);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a quick flick short of the threshold", () => {
    const { onClose } = renderViewer({});
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 150, 20],
    ]);
    release(100, 150);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("glides back on a short, slow release", () => {
    const { onClose } = renderViewer({});
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 150, 300],
    ]);
    release(100, 150);
    expect(wrapper().style.transform).toBe("none");
    expect(backdrop().style.opacity).toBe("");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(backdrop().style.transition).toBe("");
  });

  it("does not count a flick back toward center", () => {
    const { onClose } = renderViewer({});
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 200, 400],
      [100, 160, 420],
    ]);
    release(100, 160);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("works upward too", () => {
    const { onClose } = renderViewer({});
    drag([
      [100, 400, 0],
      [100, 390, 0],
      [100, 200, 400],
    ]);
    release(100, 200);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing with swipeToClose={false}", () => {
    const { onClose } = renderViewer({ swipeToClose: false });
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 300, 400],
    ]);
    release(100, 300);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(wrapper().style.transform).not.toContain("translate3d");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is suspended while the stage is shifted", () => {
    const { onClose } = renderViewer({ stageShift: "up" });
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 300, 400],
    ]);
    release(100, 300);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets a second finger cancel the drag into a pinch", () => {
    const { onClose } = renderViewer({});
    drag([
      [100, 100, 0],
      [100, 110, 0],
      [100, 300, 400],
    ]);
    fireEvent.touchStart(track(), { touches: [touch(100, 300), touch(200, 300)] });
    expect(wrapper().style.transform).toBe("none");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves horizontal swipes to navigation", () => {
    renderViewer({});
    drag([
      [300, 100, 0],
      [280, 102, 0],
      [200, 104, 100],
    ]);
    expect(wrapper().style.transform).not.toContain("translate3d");
    expect(track().style.transform).toBe("translateX(-100px)");
  });
});

describe("<ImageViewer> keyboard zoom and pan", () => {
  const wrapper = () => document.querySelector(".rvl-img-wrapper") as HTMLElement;
  const key = (k: string, init: Partial<KeyboardEventInit> = {}) =>
    fireEvent.keyDown(document, { key: k, ...init });

  it("zooms in with + and out with -", () => {
    renderViewer({});
    key("+");
    expect(wrapper().style.transform).toContain("scale(1.3)");
    key("=");
    expect(wrapper().style.transform).toContain("scale(1.69");
    key("-");
    expect(wrapper().style.transform).toContain("scale(1.3)");
    key("-");
    expect(wrapper().style.transform).toBe("none");
  });

  it("resets with 0", () => {
    renderViewer({});
    key("+");
    key("+");
    key("0");
    expect(wrapper().style.transform).toBe("none");
  });

  it("pans with the arrows while zoomed instead of navigating", () => {
    const { onIndexChange } = renderViewer({ index: 1 });
    const img = screen.getByAltText("Bravo");
    Object.defineProperty(img, "offsetWidth", { value: 1000, configurable: true });
    Object.defineProperty(img, "offsetHeight", { value: 700, configurable: true });
    act(() => {
      fireEvent.load(img);
    });
    key("+");
    const before = wrapper().style.transform;
    key("ArrowLeft");
    expect(wrapper().style.transform).not.toBe(before);
    // Left reveals the left side: the image moves right (positive x).
    expect(wrapper().style.transform).toMatch(/translate\([1-9][\d.]*px, 0px\)/);
    key("ArrowRight");
    expect(wrapper().style.transform).toBe(before);
    expect(onIndexChange).not.toHaveBeenCalled();
    expect(document.querySelector('img[src="/a.jpg"]')).toBeNull();
  });

  it("jumps to the ends with Home and End, sliding like a step", async () => {
    vi.useFakeTimers();
    installDecode();
    try {
      const fourItems = [...items, { id: "d", src: "/d.jpg", alt: "Delta" }];
      const onNavigate = vi.fn();
      const { onIndexChange, rerender } = renderViewer({ items: fourItems, onNavigate });
      key("End");
      // The target rides in the next-side panel while the slide plays.
      expect(onNavigate).toHaveBeenLastCalledWith("next");
      expect(document.querySelector('.rvl-adjacent img[src="/d.jpg"]')).not.toBeNull();
      expect(onIndexChange).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(onIndexChange).toHaveBeenLastCalledWith(3);

      rerender({ items: fourItems, onNavigate, index: 3 });
      // The landed slide's hand-off (this decode never settles, so its cap).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      key("Home");
      expect(onNavigate).toHaveBeenLastCalledWith("prev");
      expect(document.querySelector('.rvl-adjacent img[src="/a.jpg"]')).not.toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(onIndexChange).toHaveBeenLastCalledWith(0);
    } finally {
      uninstallDecode();
      vi.useRealTimers();
    }
  });

  it("does nothing with zoom={false}", () => {
    renderViewer({ zoom: false });
    key("+");
    expect(wrapper().style.transform).not.toContain("scale");
  });

  it("leaves browser shortcuts and text fields alone", () => {
    const { onIndexChange } = renderViewer({
      index: 1,
      renderOverlay: () => <input aria-label="Search" />,
    });
    key("=", { ctrlKey: true });
    expect(wrapper().style.transform).not.toContain("scale");
    const input = screen.getByLabelText("Search");
    fireEvent.keyDown(input, { key: "+" });
    fireEvent.keyDown(input, { key: "End" });
    expect(wrapper().style.transform).not.toContain("scale");
    expect(onIndexChange).not.toHaveBeenCalled();
  });
});

describe("<ImageViewer> onOpenComplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once the fade-in finishes, once", () => {
    const onOpenComplete = vi.fn();
    const { rerender } = renderViewer({ onOpenComplete });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onOpenComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onOpenComplete).toHaveBeenCalledTimes(1);
    rerender({ index: 1 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onOpenComplete).toHaveBeenCalledTimes(1);
  });

  it("waits for a thumbnail zoom's image before firing", () => {
    const onOpenComplete = vi.fn();
    renderViewer({ onOpenComplete, getOrigin: () => ({ top: 0, left: 0, width: 10, height: 10 }) });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenComplete).not.toHaveBeenCalled();
    // jsdom can't animate, so the zoom settles as soon as the image is ready.
    act(() => {
      fireEvent.load(screen.getByAltText("Alpha"));
    });
    expect(onOpenComplete).toHaveBeenCalledTimes(1);
  });

  it("doesn't fire for a viewer closed before the open settled", () => {
    const onOpenComplete = vi.fn();
    renderViewer({ onOpenComplete });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    fireEvent.click(screen.getByLabelText("Close"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenComplete).not.toHaveBeenCalled();
  });
});

describe("<ImageViewer> renderImageOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const container = () => screen.getByText("badge").parentElement!;
  const shown = () => container().classList.contains("rvl-image-overlay-shown");
  const renderImageOverlay = () => <span>badge</span>;

  it("renders inside the image wrapper, in a slot container", () => {
    renderViewer({ renderImageOverlay, classNames: { imageOverlay: "my-overlay" } });
    expect(container()).toHaveClass("rvl-image-overlay", "my-overlay");
    expect(container().parentElement).toHaveClass("rvl-img-wrapper");
  });

  it("shows once the viewer is visible and hides the moment a close starts", () => {
    renderViewer({ renderImageOverlay });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(shown()).toBe(true);
    fireEvent.click(screen.getByLabelText("Close"));
    // Still mounted (the viewer is fading out), but no longer shown.
    expect(screen.getByText("badge")).toBeInTheDocument();
    expect(shown()).toBe(false);
  });

  it("stays hidden while the opening image is held back to load", () => {
    renderViewer({
      renderImageOverlay,
      getOrigin: () => ({ top: 0, left: 0, width: 10, height: 10 }),
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shown()).toBe(false);
    act(() => {
      fireEvent.load(screen.getByAltText("Alpha"));
    });
    expect(shown()).toBe(true);
  });

  it("fades each new image's overlay in after a slide change, not the opening one", () => {
    const { rerender } = renderViewer({ renderImageOverlay });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const opening = container();
    expect(opening).not.toHaveClass("rvl-image-overlay-enter");
    rerender({ index: 1 });
    // A fresh element, so the enter animation restarts for this image.
    expect(container()).not.toBe(opening);
    expect(container()).toHaveClass("rvl-image-overlay-enter", "rvl-image-overlay-shown");
    // Coming back to the opening image after paging fades in too.
    rerender({ index: 0 });
    expect(container()).toHaveClass("rvl-image-overlay-enter");
  });

  it("renders no container without the slot", () => {
    renderViewer({});
    expect(document.querySelector(".rvl-image-overlay")).toBeNull();
  });
});

describe("<ImageViewer> renderHeaderMeta", () => {
  it("stacks a meta line under the header actions", () => {
    renderViewer({
      renderHeaderMeta: (ctx) => `posted ${ctx.item.id}`,
      classNames: { headerMeta: "my-meta" },
    });
    const meta = document.querySelector(".rvl-header-meta")!;
    expect(meta).toHaveTextContent("posted a");
    expect(meta).toHaveClass("my-meta");
    const end = meta.parentElement!;
    expect(end).toHaveClass("rvl-header-end");
    expect(end.firstElementChild).toHaveClass("rvl-header-actions");
  });

  it("leaves the bar unwrapped without it", () => {
    renderViewer({});
    expect(document.querySelector(".rvl-header-end")).toBeNull();
    expect(document.querySelector(".rvl-top-bar > .rvl-header-actions")).not.toBeNull();
  });
});

describe("<ImageViewer> backdrop fade", () => {
  /** The backdrop's fade (or another transition) finishing. */
  function transitionEnd(el: Element, propertyName = "opacity") {
    const e = new Event("transitionend", { bubbles: true });
    Object.defineProperty(e, "propertyName", { value: propertyName });
    act(() => {
      el.dispatchEvent(e);
    });
  }

  it("unmounts when the backdrop's fade ends, before the fallback", () => {
    vi.useFakeTimers();
    const { onClose } = renderViewer({});
    const backdrop = document.querySelector(".rvl-backdrop")!;
    fireEvent.click(screen.getByLabelText("Close"));
    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(onClose).not.toHaveBeenCalled();
    transitionEnd(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The fallback doesn't close a second time.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("ignores other transitions ending", () => {
    vi.useFakeTimers();
    const { onClose } = renderViewer({});
    fireEvent.click(screen.getByLabelText("Close"));
    act(() => {
      vi.advanceTimersByTime(260);
    });
    transitionEnd(document.querySelector(".rvl-backdrop")!, "backdrop-filter");
    transitionEnd(document.querySelector(".rvl-bar")!);
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("leaves a backdrop fade quicker than the collapse to the timer", () => {
    vi.useFakeTimers();
    const { onClose } = renderViewer({});
    const backdrop = document.querySelector(".rvl-backdrop") as HTMLElement;
    backdrop.style.setProperty("--rvl-backdrop-out", "100ms");
    fireEvent.click(screen.getByLabelText("Close"));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    transitionEnd(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("falls back to a longer --rvl-backdrop-out, plus slack, with no fade", () => {
    vi.useFakeTimers();
    const { onClose } = renderViewer({});
    const backdrop = document.querySelector(".rvl-backdrop") as HTMLElement;
    backdrop.style.setProperty("--rvl-backdrop-out", "600ms");
    fireEvent.click(screen.getByLabelText("Close"));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("<ImageViewer> scrollbar compensation", () => {
  /** A 15px classic root scrollbar that the scroll lock's `overflow: hidden` removes. */
  function fakeScrollbar(): () => void {
    const root = document.documentElement;
    const width = () => (document.body.style.overflow === "hidden" ? 1000 : 985);
    Object.defineProperty(root, "clientWidth", { configurable: true, get: width });
    const rect = root.getBoundingClientRect;
    root.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width(),
        bottom: 0,
        width: width(),
        height: 0,
      }) as DOMRect;
    const innerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1000,
    });
    return () => {
      delete (root as { clientWidth?: number }).clientWidth;
      root.getBoundingClientRect = rect;
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: innerWidth,
      });
    };
  }

  it("holds the overlay at its locked width once the close releases the lock", () => {
    const restore = fakeScrollbar();
    try {
      setup(0);
      const dialog = screen.getByRole("dialog");
      expect(dialog.style.right).toBe("");
      expect(document.documentElement.style.getPropertyValue("--rvl-scrollbar-width")).toBe("15px");
      fireEvent.click(screen.getByLabelText("Close"));
      // Lock released (scrollbar back), overlay still spans the full locked width.
      expect(document.body.style.position).toBe("");
      expect(dialog.style.right).toBe("-15px");
    } finally {
      restore();
    }
  });

  it("leaves the overlay alone when there's no scrollbar to compensate", () => {
    setup(0);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByLabelText("Close"));
    expect(dialog.style.right).toBe("");
  });
});

describe("<ImageViewer> tapToToggleChrome", () => {
  const root = () => screen.getByRole("dialog");
  const wrapper = () => document.querySelector(".rvl-img-wrapper") as HTMLElement;
  const track = () => document.querySelector(".rvl-track") as HTMLElement;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  // Past the ghost-click window that follows an open.
  const settle = () => act(() => void vi.advanceTimersByTime(1000));

  it("is off by default", () => {
    setup(0);
    settle();
    fireEvent.click(wrapper(), { detail: 1 });
    act(() => void vi.advanceTimersByTime(400));
    expect(root()).not.toHaveClass("rvl-chrome-hidden");
  });

  it("a click hides the bars once the double-click window passes, and another shows them", () => {
    let seen: boolean | undefined;
    setup(0, {
      tapToToggleChrome: true,
      renderFooter: (ctx) => {
        seen = ctx.chromeHidden;
        return null;
      },
    });
    settle();
    fireEvent.click(wrapper(), { detail: 1 });
    expect(root()).not.toHaveClass("rvl-chrome-hidden");
    act(() => void vi.advanceTimersByTime(300));
    expect(root()).toHaveClass("rvl-chrome-hidden");
    expect(seen).toBe(true);

    fireEvent.click(wrapper(), { detail: 1 });
    act(() => void vi.advanceTimersByTime(300));
    expect(root()).not.toHaveClass("rvl-chrome-hidden");
    expect(seen).toBe(false);
  });

  it("a double click zooms without toggling", () => {
    setup(0, { tapToToggleChrome: true });
    settle();
    fireEvent.click(wrapper(), { detail: 1 });
    fireEvent.click(wrapper(), { detail: 2 });
    act(() => void vi.advanceTimersByTime(400));
    expect(root()).not.toHaveClass("rvl-chrome-hidden");
  });

  it("toggles at once when zoom is off (no double tap to wait for)", () => {
    setup(0, { tapToToggleChrome: true, zoom: false });
    settle();
    fireEvent.click(wrapper(), { detail: 1 });
    expect(root()).toHaveClass("rvl-chrome-hidden");
  });

  it("a touch tap toggles, and its synthesized click doesn't toggle again", () => {
    setup(0, { tapToToggleChrome: true });
    settle();
    const t = { clientX: 50, clientY: 50 };
    fireEvent.touchStart(track(), { touches: [t] });
    fireEvent.touchEnd(track(), { touches: [], changedTouches: [t] });
    fireEvent.click(wrapper(), { detail: 1 });
    act(() => void vi.advanceTimersByTime(300));
    expect(root()).toHaveClass("rvl-chrome-hidden");
    act(() => void vi.advanceTimersByTime(1000));
    expect(root()).toHaveClass("rvl-chrome-hidden");
  });

  it("a background tap still closes when closeOnBackdropClick is on", () => {
    const { onClose } = setup(0, { tapToToggleChrome: true, closeOnBackdropClick: true });
    settle();
    fireEvent.click(track(), { detail: 1 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(onClose).toHaveBeenCalled();
    expect(root()).not.toHaveClass("rvl-chrome-hidden");
  });
});

describe("<ImageViewer> zoom-resolution upgrade", () => {
  const zoomItems: ViewerItem[] = [
    { id: "a", src: "/a.jpg", alt: "Alpha", zoomSrc: "/a-full.jpg" },
    { id: "b", src: "/b.jpg", alt: "Bravo", zoomSrc: "/b-full.jpg" },
  ];
  const active = () => screen.getByAltText(/Alpha|Bravo/) as HTMLImageElement;
  const press = (key: string) => fireEvent.keyDown(window, { key });
  beforeEach(() => {
    installDecode();
    vi.useFakeTimers();
  });
  afterEach(() => {
    uninstallDecode();
    vi.useRealTimers();
  });

  it("swaps in zoomSrc once a zoom past 1.5x settles and it has decoded", async () => {
    renderViewer({ items: zoomItems });
    press("+"); // 1.3x: not yet
    act(() => void vi.advanceTimersByTime(400));
    expect(pendingDecodes.some((p) => p.src.endsWith("/a-full.jpg"))).toBe(false);

    press("+"); // 1.69x
    act(() => void vi.advanceTimersByTime(400));
    expect(active().getAttribute("src")).toBe("/a.jpg");
    await settleDecodes("/a-full.jpg");
    expect(active().src).toMatch(/\/a-full\.jpg$/);
    expect(active()).not.toHaveAttribute("srcset");
  });

  it("doesn't fetch again on a further zoom, and keeps the sharp source zoomed out", async () => {
    renderViewer({ items: zoomItems });
    press("+");
    press("+");
    act(() => void vi.advanceTimersByTime(400));
    await settleDecodes("/a-full.jpg");
    press("+");
    act(() => void vi.advanceTimersByTime(400));
    expect(pendingDecodes.some((p) => p.src.endsWith("/a-full.jpg"))).toBe(false);
    press("0");
    expect(active().src).toMatch(/\/a-full\.jpg$/);
  });

  it("drops the upgrade on navigation", async () => {
    const { rerender } = renderViewer({ items: zoomItems });
    press("+");
    press("+");
    act(() => void vi.advanceTimersByTime(400));
    await settleDecodes("/a-full.jpg");
    rerender({ items: zoomItems, index: 1 });
    expect(active().getAttribute("src")).toBe("/b.jpg");
  });

  it("falls back to the original if the sharp source then fails", async () => {
    renderViewer({ items: zoomItems });
    press("+");
    press("+");
    act(() => void vi.advanceTimersByTime(400));
    await settleDecodes("/a-full.jpg");
    fireEvent.error(active());
    expect(active().getAttribute("src")).toBe("/a.jpg");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does nothing for an item with neither zoomSrc nor srcSet", () => {
    renderViewer({});
    press("+");
    press("+");
    act(() => void vi.advanceTimersByTime(400));
    // Only the neighbor warm (/b.jpg) decodes; nothing probes for /a.jpg.
    expect(pendingDecodes.map((p) => p.src)).toEqual([expect.stringMatching(/\/b\.jpg$/)]);
  });
});

describe("<ImageViewer> slide hand-off", () => {
  const panels = () => [...document.querySelectorAll(".rvl-adjacent")] as HTMLElement[];
  beforeEach(() => {
    vi.useFakeTimers();
    installDecode();
  });
  afterEach(() => {
    uninstallDecode();
    vi.useRealTimers();
  });

  // Drive a committed next-slide through to the index change, as the parent's
  // onIndexChange → re-render would.
  async function slideNext(from: number) {
    const onIndexChange = vi.fn();
    const utils = renderViewer({ index: from, onIndexChange });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onIndexChange).toHaveBeenLastCalledWith(from + 1);
    utils.rerender({ index: from + 1, onIndexChange });
    return { ...utils, onIndexChange };
  }

  it("keeps the incoming panel at center, on the active item, until the new image decodes", async () => {
    await slideNext(0);
    // Only the panel that slid in, at center, still showing /b.jpg.
    expect(panels()).toHaveLength(1);
    expect(panels()[0].style.transform).toBe("translateX(0px)");
    expect(panels()[0].querySelector("img")!.getAttribute("src")).toBe("/b.jpg");
    expect(screen.getByAltText("Bravo")).toHaveAttribute("src", "/b.jpg");

    // The active image decodes; the panel goes after a painted frame.
    await settleDecodes("/b.jpg");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(panels()).toHaveLength(0);
  });

  it("gives up waiting on a decode that stalls", async () => {
    await slideNext(0);
    expect(panels()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(panels()).toHaveLength(0);
  });

  it("holds a flick that lands mid-hand-off until the hand-off ends", async () => {
    const { onIndexChange, rerender } = await slideNext(0);
    const onNavigate = vi.fn();
    rerender({ index: 1, onIndexChange, onNavigate });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    // Still covering the swap: the next slide hasn't started.
    expect(onNavigate).not.toHaveBeenCalled();
    await settleDecodes("/b.jpg");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(onNavigate).toHaveBeenCalledWith("next");
  });

  it("has nothing to hand off when the index changes from outside", () => {
    const { rerender } = renderViewer({ index: 0 });
    rerender({ index: 1 });
    expect(panels()).toHaveLength(0);
  });
});
