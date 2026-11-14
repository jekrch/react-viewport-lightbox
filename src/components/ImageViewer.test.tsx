import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach } from "vitest";
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

  it("reveals the image even if it fails to load", () => {
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

  it("lets a non-null ctx.setContentShift override the prop", () => {
    let ctxRef: ViewerContext | null = null;
    renderViewer({
      stageShift: "up",
      renderOverlay: (ctx) => {
        ctxRef = ctx;
        return null;
      },
    });
    act(() => ctxRef!.setContentShift("translateY(10px)"));
    expect(stage().style.transform).toBe("translateY(10px)");
    act(() => ctxRef!.setContentShift(null));
    expect(stage().style.transform).toBe("translateY(-100vh)");
  });
});

describe("<ImageViewer> neighbor warm", () => {
  it("keys on neighbor sources, not on items identity", () => {
    const warmed: string[] = [];
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
    try {
      const { rerender } = renderViewer({ index: 1 });
      expect(warmed).toEqual(["/a.jpg", "/c.jpg"]);
      // A fresh but equal array (the inline `items={photos.map(…)}` pattern).
      rerender({ items: items.map((it) => ({ ...it })) });
      expect(warmed).toHaveLength(2);
      rerender({ index: 2 });
      expect(warmed).toEqual(["/a.jpg", "/c.jpg", "/b.jpg"]);
    } finally {
      vi.unstubAllGlobals();
    }
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
    expect(hintEl()).toHaveTextContent("← → or drag to navigate · scroll to zoom · esc to close");
    expect(hintEl()).toHaveClass("my-hint");
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

  it("jumps to the ends with Home and End", () => {
    const { onIndexChange } = renderViewer({ index: 1 });
    key("End");
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    key("Home");
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
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
    Object.defineProperty(root, "clientWidth", {
      configurable: true,
      get: () => (document.body.style.overflow === "hidden" ? 1000 : 985),
    });
    const innerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1000,
    });
    return () => {
      delete (root as { clientWidth?: number }).clientWidth;
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
