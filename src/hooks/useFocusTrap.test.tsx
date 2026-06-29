import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFocusTrap } from "./useFocusTrap";

function makeContainer() {
  const container = document.createElement("div");
  container.tabIndex = -1;
  const button = document.createElement("button");
  button.textContent = "inside";
  container.appendChild(button);
  document.body.appendChild(container);
  return { container, button };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useFocusTrap", () => {
  it("moves focus into the container when activated", () => {
    const { container } = makeContainer();
    renderHook(() => useFocusTrap({ current: container }, true));
    expect(document.activeElement).toBe(container);
  });

  it("restores focus to the previously-focused element on unmount", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const { container } = makeContainer();
    const { unmount } = renderHook(() => useFocusTrap({ current: container }, true));
    expect(document.activeElement).toBe(container);

    unmount();
    expect(document.activeElement).toBe(outside);
  });

  it("does nothing while inactive", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    const { container } = makeContainer();
    renderHook(() => useFocusTrap({ current: container }, false));
    expect(document.activeElement).toBe(outside);
  });

  it("keeps focus inside the container on Tab", () => {
    const { container } = makeContainer();
    renderHook(() => useFocusTrap({ current: container }, true));

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container);
  });
});
