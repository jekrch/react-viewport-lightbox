import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { resetPrefetchCache } from "./src/prefetch";

// prefetchItem shares requests module-wide; jsdom never settles them, so a
// source requested in one test would read as in flight in the next.
afterEach(() => resetPrefetchCache());
