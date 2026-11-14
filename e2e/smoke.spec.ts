import { expect, test, type Page } from "@playwright/test";

// Smoke tests in a real browser against the built playground. DOM state and
// URLs only. The playground has `history={{ param: "photo" }}` on by default,
// loops, and opens from tiles marked by useLightbox's triggerProps.

const tiles = (page: Page) => page.locator("[data-rvl-trigger]");
const dialog = (page: Page) => page.getByRole("dialog");
const activeImg = (page: Page) => page.locator(".rvl-img-wrapper img");
const photoParam = (page: Page) => new URL(page.url()).searchParams.get("photo");

async function altOf(page: Page, i: number) {
  return (await tiles(page).nth(i).locator("img").getAttribute("alt")) ?? "";
}

async function open(page: Page, i = 0) {
  await tiles(page).nth(i).click();
  await expect(dialog(page)).toBeVisible();
  await expect(activeImg(page)).toHaveAttribute("alt", await altOf(page, i));
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(tiles(page).first()).toBeVisible();
});

test("opens from a tile and closes with the close button", async ({ page }) => {
  await open(page, 0);
  expect(photoParam(page)).toBe("trees");
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(photoParam(page)).toBeNull();
});

test("traps focus while open and restores it to the tile on close", async ({ page }) => {
  const tile = tiles(page).nth(1);
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  const focusInDialog = () =>
    page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  await expect.poll(focusInDialog).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInDialog()).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInDialog()).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(tile).toBeFocused();
});

test("arrow keys, Home and End navigate; the URL follows", async ({ page }) => {
  const count = await tiles(page).count();
  await open(page, 0);
  await page.keyboard.press("ArrowRight");
  await expect(activeImg(page)).toHaveAttribute("alt", await altOf(page, 1));
  expect(photoParam(page)).toBe("cat");
  await page.keyboard.press("End");
  await expect(activeImg(page)).toHaveAttribute("alt", await altOf(page, count - 1));
  await page.keyboard.press("Home");
  await expect(activeImg(page)).toHaveAttribute("alt", await altOf(page, 0));
  await page.keyboard.press("ArrowLeft"); // loops to the last
  await expect(activeImg(page)).toHaveAttribute("alt", await altOf(page, count - 1));
});

test("zoom keys zoom and reset; arrows pan while zoomed", async ({ page }) => {
  await open(page, 0);
  const reset = dialog(page).getByRole("button", { name: "Reset zoom" });
  await page.keyboard.press("+");
  await expect(reset).toHaveText("130%");
  const before = await activeImg(page).getAttribute("alt");
  await page.keyboard.press("ArrowRight"); // pans, doesn't navigate
  await expect(activeImg(page)).toHaveAttribute("alt", before ?? "");
  await page.keyboard.press("0");
  await expect(reset).toHaveCount(0);
});

test("wheel: a plain wheel is left to the browser, Ctrl+wheel zooms, then the wheel pans", async ({
  page,
}) => {
  await open(page, 0);
  const wrapper = page.locator(".rvl-img-wrapper");
  const box = (await activeImg(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Unzoomed: not prevented (trackpad swipe-back), no zoom.
  const prevented = await wrapper.evaluate((el) => {
    const e = new WheelEvent("wheel", { deltaY: 40, deltaX: -40, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(wrapper).not.toHaveAttribute("style", /scale/);

  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -50);
  await page.keyboard.up("Control");
  await expect(dialog(page).getByRole("button", { name: "Reset zoom" })).toBeVisible();

  const transform = () => wrapper.evaluate((el) => el.style.transform);
  const zoomed = await transform();
  await page.mouse.wheel(0, 60);
  await expect.poll(transform).not.toBe(zoomed);
  await expect.poll(transform).toMatch(/^scale\(/);
});

test("the back button closes the viewer and restores the URL", async ({ page }) => {
  await open(page, 2);
  expect(photoParam(page)).toBeTruthy();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  expect(photoParam(page)).toBeNull();
  // Still on the playground: back left the page's own entry alone.
  await expect(tiles(page).first()).toBeVisible();
});

test("Escape and back close the drawer before the viewer", async ({ page }) => {
  await open(page, 0);
  const stage = page.locator(".rvl-stage");
  const details = dialog(page).getByRole("button", { name: "Show details" });

  await details.click();
  await expect(stage).toHaveAttribute("style", /-100vh/);
  await page.keyboard.press("Escape");
  await expect(stage).not.toHaveAttribute("style", /-100vh/);
  await expect(dialog(page)).toBeVisible();

  await details.click();
  await expect(stage).toHaveAttribute("style", /-100vh/);
  await page.goBack();
  await expect(stage).not.toHaveAttribute("style", /-100vh/);
  await expect(dialog(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("a deep link opens on its photo, and closing drops the parameter", async ({ page }) => {
  await page.goto("./?photo=cat");
  await expect(dialog(page)).toBeVisible();
  await expect(activeImg(page)).toHaveAttribute("alt", await altOf(page, 1));
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(photoParam(page)).toBeNull();
});
