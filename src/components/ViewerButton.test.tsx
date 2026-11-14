import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ViewerButton } from "./ViewerButton";

afterEach(cleanup);

describe("<ViewerButton>", () => {
  it("is a plain chrome button by default, with the label as its tooltip", () => {
    render(
      <ViewerButton label="Details" onClick={() => {}}>
        i
      </ViewerButton>,
    );
    const btn = screen.getByRole("button", { name: "Details" });
    expect(btn).toHaveClass("rvl-btn");
    expect(btn).toHaveAttribute("title", "Details");
    expect(btn).not.toHaveAttribute("aria-pressed");
    expect(btn).not.toHaveClass("is-active");
  });

  it("reports a toggle's state through is-active and aria-pressed", () => {
    const { rerender } = render(
      <ViewerButton label="Graph" active={false} onClick={() => {}}>
        g
      </ViewerButton>,
    );
    const btn = screen.getByRole("button", { name: "Graph" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    rerender(
      <ViewerButton label="Graph" active onClick={() => {}}>
        g
      </ViewerButton>,
    );
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveClass("is-active");
  });

  it("keeps the click from reaching the backdrop", () => {
    const outer = vi.fn();
    const onClick = vi.fn();
    render(
      <div onClick={outer}>
        <ViewerButton label="Close" title="Close (Esc)" onClick={onClick}>
          x
        </ViewerButton>
      </div>,
    );
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveAttribute("title", "Close (Esc)");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
