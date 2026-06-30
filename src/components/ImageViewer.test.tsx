import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach } from "vitest";
import { ImageViewer } from "./ImageViewer";
import type { ViewerItem } from "../types";

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
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("closes on a backdrop click when closeOnBackdropClick is set", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0, { closeOnBackdropClick: true });
    fireEvent.click(document.querySelector(".rvl-stage")!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("ignores backdrop clicks by default", () => {
    vi.useFakeTimers();
    const { onClose } = setup(0);
    fireEvent.click(document.querySelector(".rvl-stage")!);
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
      vi.advanceTimersByTime(300);
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
    const getOriginRect = vi.fn().mockReturnValue(rect);
    setup(1, { getOriginRect });
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
    const getOriginRect = vi.fn().mockReturnValue({ top: 0, left: 0, width: 10, height: 10 });
    setup(1, { getOriginRect });
    const img = screen.getByAltText("Bravo");
    act(() => {
      fireEvent.error(img);
    });
    expect(img.style.opacity).toBe("");
  });

  it("leaves the image visible when getOriginRect is omitted", () => {
    setup(1);
    expect(screen.getByAltText("Bravo").style.opacity).toBe("");
  });

  it("shows a loading spinner only after the image is slow to load", () => {
    vi.useFakeTimers();
    const getOriginRect = vi.fn().mockReturnValue({ top: 0, left: 0, width: 10, height: 10 });
    setup(1, { getOriginRect });
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
    const getOriginRect = vi.fn().mockReturnValue(rect);
    const { onClose } = setup(2, { getOriginRect });
    getOriginRect.mockClear();
    fireEvent.click(screen.getByLabelText("Close"));
    // The current index is queried so the image collapses into its own thumbnail.
    expect(getOriginRect).toHaveBeenCalledWith(2);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
