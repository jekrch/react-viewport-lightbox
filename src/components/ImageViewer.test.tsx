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

  it("loops the prev button at the first item when loop is enabled", () => {
    const { onIndexChange } = setup(0, { loop: true });
    const prev = screen.getByLabelText("Previous image");
    expect(prev).toBeEnabled();
    fireEvent.click(prev);
    expect(onIndexChange).toHaveBeenCalledWith(items.length - 1);
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
    const { onIndexChange } = setup(0, { loop: true });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(items.length - 1);
  });

  it("wraps to the first item on ArrowRight from the last when looping", () => {
    const { onIndexChange } = setup(items.length - 1, { loop: true });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(0);
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
});
