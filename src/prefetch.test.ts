import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prefetchItem, prefersSaveData } from "./prefetch";

interface FakeImage {
  src: string;
  srcset: string;
  sizes: string;
  fetchPriority: string;
}

let created: FakeImage[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal(
    "Image",
    class implements FakeImage {
      src = "";
      srcset = "";
      sizes = "";
      fetchPriority = "auto";
      constructor() {
        created.push(this);
      }
      decode() {
        return this.src.includes("broken")
          ? Promise.reject(new Error("decode failed"))
          : Promise.resolve();
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefetchItem", () => {
  it("fetches at high priority by default, mirroring srcset and sizes", async () => {
    await expect(
      prefetchItem({ src: "/a.jpg", srcSet: "/a-800.jpg 800w", sizes: "50vw" }),
    ).resolves.toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      src: "/a.jpg",
      srcset: "/a-800.jpg 800w",
      sizes: "50vw",
      fetchPriority: "high",
    });
  });

  it("takes a priority", () => {
    prefetchItem({ src: "/a.jpg" }, { priority: "low" });
    expect(created[0].fetchPriority).toBe("low");
  });

  it("shares one request per source", () => {
    const first = prefetchItem({ src: "/a.jpg" });
    expect(prefetchItem({ src: "/a.jpg" }, { priority: "low" })).toBe(first);
    expect(created).toHaveLength(1);
  });

  it("treats a different srcset as a different source", () => {
    prefetchItem({ src: "/a.jpg" });
    prefetchItem({ src: "/a.jpg", srcSet: "/a-800.jpg 800w" });
    expect(created).toHaveLength(2);
  });

  it("resolves false on failure and lets the source be retried", async () => {
    await expect(prefetchItem({ src: "/broken.jpg" })).resolves.toBe(false);
    prefetchItem({ src: "/broken.jpg" });
    expect(created).toHaveLength(2);
  });

  it("ignores an item without a src", async () => {
    await expect(prefetchItem({ src: "" })).resolves.toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("prefersSaveData", () => {
  afterEach(() => {
    delete (navigator as { connection?: unknown }).connection;
  });

  it("is false without the Network Information API", () => {
    expect(prefersSaveData()).toBe(false);
  });

  it("reads navigator.connection.saveData", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    expect(prefersSaveData()).toBe(true);
  });
});
