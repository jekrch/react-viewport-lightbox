/* global window, document, performance, requestAnimationFrame */
// Performance regression bench. Numbers only: no screenshots, no visual checks.
//
//   npm run bench             run, print medians, compare to bench/baseline.json
//   npm run bench -- --update run and write the result as the new baseline
//   npm run bench -- --runs 9 --throttle 6
//   npm run bench -- --traces <dir>   also save the last run's raw traces
//                                     (open in DevTools → Performance)
//
// Builds the fixture in bench/ (a scrolled 600-tile gallery) for production,
// serves it, and drives headless Chromium under CPU throttling through four
// phases, each traced on its own: open (zoom from a tile), swipe (drag to the
// next slide), close (Escape), and dismiss (open, then drag down to close).
// Per phase it reads the renderer main thread from the trace: busy time, the
// longest task, style recalc and layout cost. Swipe and dismiss also count
// slow animation frames. Each number is the median over the runs.
//
// Local only, before releases: CI runners are too noisy for timing. Needs
// Chromium for playwright-core (`npx playwright install chromium` once).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = join(ROOT, "bench");
const OUT_DIR = join(ROOT, "node_modules/.cache/rvl-bench");
const BASELINE = join(FIXTURE, "baseline.json");

const { values: args } = parseArgs({
  options: {
    update: { type: "boolean", default: false },
    runs: { type: "string", default: "5" },
    throttle: { type: "string", default: "4" },
    traces: { type: "string" },
  },
});
const RUNS = Number(args.runs);
const THROTTLE = Number(args.throttle);

// A metric regresses when it is both >20% and more than `floor` worse than the
// baseline; the floor keeps tiny absolute numbers from tripping on noise.
const TOLERANCE = 0.2;
const FLOOR = { ms: 5, count: 3, frames: 2 };

const TRACE_CATEGORIES = ["toplevel", "devtools.timeline", "blink.user_timing"];

// ---------------------------------------------------------------- fixture

async function serveFixture() {
  mkdirSync(OUT_DIR, { recursive: true });
  const config = {
    root: FIXTURE,
    configFile: false,
    logLevel: "error",
    plugins: [react()],
    build: { outDir: OUT_DIR, emptyOutDir: true },
    preview: { port: 0, host: "127.0.0.1" },
  };
  await build({ ...config, mode: "production" });
  const server = await preview(config);
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("vite preview did not report a URL");
  return { url, close: () => server.close() };
}

// ---------------------------------------------------------------- tracing

function mainThreadEvents(traceBuffer) {
  const { traceEvents } = JSON.parse(traceBuffer.toString());
  const mains = new Set(
    traceEvents
      .filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain")
      .map((e) => `${e.pid}:${e.tid}`),
  );
  // One page, but Chromium may keep spare renderers: take the busiest.
  const busy = new Map();
  for (const e of traceEvents) {
    const key = `${e.pid}:${e.tid}`;
    if (mains.has(key) && TASK_NAMES.has(e.name) && e.dur) {
      busy.set(key, (busy.get(key) ?? 0) + e.dur);
    }
  }
  const main = [...busy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return traceEvents.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === "X" && e.dur);
}

// Chromium has named the top-level task event both ways.
const TASK_NAMES = new Set(["RunTask", "ThreadControllerImpl::RunTask"]);

/** Top-level tasks only: a task nested inside another isn't counted twice. */
function topLevelTasks(events) {
  const tasks = events.filter((e) => TASK_NAMES.has(e.name)).sort((a, b) => a.ts - b.ts);
  const out = [];
  let end = -Infinity;
  for (const e of tasks) {
    if (e.ts >= end) {
      out.push(e);
      end = e.ts + e.dur;
    }
  }
  return out;
}

function threadMetrics(events) {
  const ms = (us) => Math.round(us / 100) / 10;
  const total = (list) => ms(list.reduce((t, e) => t + e.dur, 0));
  const tasks = topLevelTasks(events);
  const styles = events.filter((e) => e.name === "UpdateLayoutTree");
  return {
    busyMs: total(tasks),
    longestTaskMs: ms(Math.max(0, ...tasks.map((e) => e.dur))),
    styleMs: total(styles),
    styleCount: styles.length,
    layoutMs: total(events.filter((e) => e.name === "Layout")),
  };
}

// Set for the last run when --traces is given: phase name → file path.
let saveTraceAs = null;

async function traced(browser, page, phase, action) {
  await browser.startTracing(page, { categories: TRACE_CATEGORIES });
  let extra;
  try {
    extra = await action();
  } catch (error) {
    await browser.stopTracing();
    throw error;
  }
  const buffer = await browser.stopTracing();
  if (saveTraceAs) writeFileSync(join(saveTraceAs, `${phase}.json`), buffer);
  return { ...threadMetrics(mainThreadEvents(buffer)), ...extra };
}

// ---------------------------------------------------------------- page helpers

const waitForMark = (page, name) =>
  page.waitForFunction((n) => performance.getEntriesByName(n).length > 0, name, {
    timeout: 15_000,
  });

const settle = (page, ms) => page.waitForTimeout(ms);

/** Wall time between two marks, in ms. */
const between = (page, a, b) =>
  page.evaluate(
    ([a, b]) =>
      performance.getEntriesByName(b)[0].startTime - performance.getEntriesByName(a)[0].startTime,
    [a, b],
  );

/** Record animation-frame gaps until the returned stop() is awaited. */
async function startFrameRecorder(page) {
  await page.evaluate(() => {
    const deltas = [];
    let last = performance.now();
    let running = true;
    const tick = (t) => {
      deltas.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__rvlFrames = () => {
      running = false;
      return deltas.slice(1);
    };
  });
  return async () => {
    const deltas = await page.evaluate(() => window.__rvlFrames());
    return { slowFrames: deltas.filter((d) => d > 25).length };
  };
}

/** Center of a tile that's fully on screen, below the sticky header. */
async function pickTile(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll("[data-tile]")) {
      const r = el.getBoundingClientRect();
      if (r.top > 80 && r.bottom < vh - 20 && r.left > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    throw new Error("no tile on screen");
  });
}

async function drag(page, from, dx, dy, steps) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up();
}

// ---------------------------------------------------------------- one run

async function run(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "networkidle" });
  // A scrolled page exercises the scroll lock's pin/restore path.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await settle(page, 300);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

  const center = { x: 640, y: 400 };
  const clearMarks = () => page.evaluate(() => performance.clearMarks());
  const result = {};

  await clearMarks();
  const tile = await pickTile(page);
  result.open = await traced(browser, page, "open", async () => {
    await page.mouse.click(tile.x, tile.y);
    await waitForMark(page, "rvl:open-end");
    return { wallMs: await between(page, "rvl:open-start", "rvl:open-end") };
  });
  await settle(page, 400);

  await clearMarks();
  result.swipe = await traced(browser, page, "swipe", async () => {
    const stop = await startFrameRecorder(page);
    await drag(page, center, -520, 0, 16);
    await waitForMark(page, "rvl:navigated");
    await settle(page, 500);
    return stop();
  });

  await clearMarks();
  result.close = await traced(browser, page, "close", async () => {
    await page.keyboard.press("Escape");
    await waitForMark(page, "rvl:close-end");
    return { wallMs: await between(page, "rvl:close-start", "rvl:close-end") };
  });
  await settle(page, 400);

  await clearMarks();
  await page.mouse.click(tile.x, tile.y);
  await waitForMark(page, "rvl:open-end");
  await settle(page, 400);
  await clearMarks();
  result.dismiss = await traced(browser, page, "dismiss", async () => {
    const stop = await startFrameRecorder(page);
    await drag(page, center, 0, 360, 12);
    await waitForMark(page, "rvl:close-end");
    await settle(page, 200);
    return stop();
  });

  await page.close();
  return result;
}

// ---------------------------------------------------------------- report

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function summarize(runs) {
  const out = {};
  for (const phase of Object.keys(runs[0])) {
    out[phase] = {};
    for (const metric of Object.keys(runs[0][phase])) {
      out[phase][metric] = Math.round(median(runs.map((r) => r[phase][metric])) * 10) / 10;
    }
  }
  return out;
}

const floorFor = (metric) =>
  metric.endsWith("Ms") ? FLOOR.ms : metric === "slowFrames" ? FLOOR.frames : FLOOR.count;

function report(result, baseline) {
  let regressed = false;
  for (const [phase, metrics] of Object.entries(result)) {
    console.log(`\n${phase}`);
    for (const [metric, value] of Object.entries(metrics)) {
      const base = baseline?.result?.[phase]?.[metric];
      let note = "";
      if (base !== undefined) {
        const worse = value - base > floorFor(metric) && value > base * (1 + TOLERANCE);
        if (worse) regressed = true;
        const pct = base
          ? `${value >= base ? "+" : ""}${Math.round(((value - base) / base) * 100)}%`
          : "";
        note = `  (baseline ${base}${pct ? `, ${pct}` : ""})${worse ? "  ✗ REGRESSION" : ""}`;
      }
      console.log(`  ${metric.padEnd(14)} ${String(value).padStart(8)}${note}`);
    }
  }
  return regressed;
}

// ---------------------------------------------------------------- main

const server = await serveFixture();
let browser;
try {
  browser = await chromium.launch({
    // Keep classic scrollbars so the scroll lock's compensation path runs.
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  console.log(`bench: ${RUNS} runs (+1 warm-up), CPU throttle ${THROTTLE}×`);
  await run(browser, server.url); // warm-up: JIT, image decode caches
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    if (args.traces && i === RUNS - 1) {
      saveTraceAs = resolve(args.traces);
      mkdirSync(saveTraceAs, { recursive: true });
    }
    runs.push(await run(browser, server.url));
  }
  if (saveTraceAs) console.log(`traces from the last run saved in ${saveTraceAs}`);
  const result = summarize(runs);

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
  if (baseline && (baseline.runs !== RUNS || baseline.throttle !== THROTTLE)) {
    console.log("\n(baseline was recorded with different --runs/--throttle; comparing anyway)");
  }
  const regressed = report(result, baseline);

  if (args.update) {
    const record = { recorded: new Date().toISOString(), runs: RUNS, throttle: THROTTLE, result };
    writeFileSync(BASELINE, JSON.stringify(record, null, 2) + "\n");
    console.log(`\nbaseline written to ${BASELINE}`);
  } else if (!baseline) {
    console.log("\nno baseline yet: run `npm run bench -- --update` to record one");
  } else if (regressed) {
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server.close();
}
