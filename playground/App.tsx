import { useEffect, useRef, useState } from "react";
import { ImageViewer, type ViewerContext, type ViewerItem } from "@jekrch/react-viewport-lightbox";
import { CodePanel } from "./CodePanel";
import "../src/styles.css";
import "./playground.css";

// Per-slide detail payload. It lives on each item as `data`, so the
// overlay reads `ctx.item.data` with no parallel lookup keyed by index/id.
interface SlideDetail {
  title: string;
  body: string;
  credit: string;
}

const items: ViewerItem<SlideDetail>[] = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  src: `https://picsum.photos/id/${10 + i}/1600/1000`,
  thumbnail: `https://picsum.photos/id/${10 + i}/480/300`,
  alt: `Demo image ${i + 1}`,
  data: {
    title: `Image ${i + 1}`,
    body: "Per-slide copy that travels with the item. Swipe and watch it update with the image, with no parallel details array to keep in sync.",
    credit: `picsum.photos · id ${10 + i}`,
  },
}));

const PAGE_BG = "#0b0b0c";
const INSTALL_CMD = "npm add @jekrch/react-viewport-lightbox";
const REPO_URL = "https://github.com/jekrch/react-viewport-lightbox";

const FEATURES = [
  {
    title: "Touch & desktop",
    body: "Wheel/pinch zoom, drag-swipe navigation, double-tap, keyboard arrows, rubber-band edges.",
  },
  {
    title: "Zero dependencies",
    body: "React is the only peer. No Tailwind, no icon library, no runtime deps.",
  },
  {
    title: "Themeable",
    body: "Restyle with CSS custom properties, or override any slot's className.",
  },
  {
    title: "Accessible & headless",
    body: "Focus trap, restore, reduced-motion, or drop the shell and use the hooks.",
  },
];

const ACCENTS = ["#4c538d", "#7fb069", "#ff5c8a", "#e0913a", "#3aa0c2"];

export function App() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [loop, setLoop] = useState(true);
  const [zoom, setZoom] = useState(true);
  const [zoomToCursor, setZoomToCursor] = useState(true);
  const [closeOnBackdropClick, setCloseOnBackdropClick] = useState(true);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // When navigating with the drawer open, it slides out sideways with the image.
  const [slideDir, setSlideDir] = useState<"prev" | "next" | null>(null);
  // Suppresses the transition for one frame so re-parking the drawer (from
  // off-the-side back to off-the-bottom) snaps instantly instead of sweeping
  // diagonally across the viewport.
  const [instantPark, setInstantPark] = useState(false);
  // Captured from a render slot so the onNavigate handler can reset the shift.
  const shiftRef = useRef<ViewerContext["setContentShift"] | null>(null);
  // Live refs to each gallery thumbnail so the viewer can expand out of (and
  // collapse back into) the one that was clicked.
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Once the new index has landed (slide finished), re-park the drawer at the
  // bottom WITHOUT animating; both positions are off-screen, so the user never
  // sees it move.
  useEffect(() => {
    if (!slideDir) return;
    setInstantPark(true);
    setSlideDir(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Restore the transition the frame after the instant re-park is applied.
  useEffect(() => {
    if (!instantPark) return;
    const raf = requestAnimationFrame(() => setInstantPark(false));
    return () => cancelAnimationFrame(raf);
  }, [instantPark]);

  const openAt = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Closed drawer is parked off the bottom; navigating slides it out in the
  // swipe direction (image moves left on "next", so the drawer exits left).
  const drawerTransform = slideDir
    ? `translateX(${slideDir === "next" ? "-100%" : "100%"})`
    : drawerOpen
      ? "translateY(0)"
      : "translateY(100vh)";

  // Setting the library + page accent vars on the wrapper cascades into the
  // viewer (it renders as a child of this element), so theming is live.
  const themeVars = {
    "--rvl-accent": accent,
    "--pg-accent": accent,
  } as React.CSSProperties;

  return (
    <div className="pg" style={themeVars}>
      <header className="pg-hero">
        <div className="pg-badges">
          <span className="pg-badge">Zero dependencies</span>
          <span className="pg-badge">React 18+</span>
          <span className="pg-badge">TypeScript</span>
          <span className="pg-badge">MIT</span>
        </div>
        <h1 className="pg-title">
          react-<span className="pg-title-accent">viewport</span>-lightbox
        </h1>
        <p className="pg-tagline">
          A touch-friendly React image viewer with zoom, pan, pinch, and swipe, plus render slots
          for headers, footers, and overlays, and exported hooks if you'd rather build your own
          shell.
        </p>
        <div className="pg-cta">
          <div className="pg-install">
            <code>{INSTALL_CMD}</code>
            <button className="pg-copy" onClick={copyInstall}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <a className="pg-link" href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
      </header>

      <section className="pg-section">
        <div className="pg-section-head">
          <h2>Why</h2>
        </div>
        <div className="pg-features">
          {FEATURES.map((f) => (
            <div className="pg-feature" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pg-section">
        <div className="pg-section-head">
          <h2>Try it</h2>
          <p>Open an image, then zoom, swipe, and toggle Details.</p>
        </div>

        <div className="pg-controls">
          <label className="pg-toggle">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop
          </label>
          <label className="pg-toggle">
            <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
            Zoom &amp; pan
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={zoomToCursor}
              disabled={!zoom}
              onChange={(e) => setZoomToCursor(e.target.checked)}
            />
            Zoom to cursor
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={closeOnBackdropClick}
              onChange={(e) => setCloseOnBackdropClick(e.target.checked)}
            />
            Click backdrop to close
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={showCode}
              onChange={(e) => setShowCode(e.target.checked)}
            />
            Show code
          </label>
          <div className="pg-swatches">
            <span>Accent</span>
            {ACCENTS.map((c) => (
              <button
                key={c}
                className={`pg-swatch${c === accent ? " is-active" : ""}`}
                style={{ background: c }}
                onClick={() => setAccent(c)}
                aria-label={`Accent ${c}`}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Kept mounted and animated open/closed via a grid-rows transition so
            the snippet slides in instead of popping. */}
        <div className={`pg-code-wrap${showCode ? " is-open" : ""}`} aria-hidden={!showCode}>
          <div className="pg-code-inner">
            <CodePanel
              loop={loop}
              zoom={zoom}
              zoomToCursor={zoomToCursor}
              closeOnBackdropClick={closeOnBackdropClick}
              accent={accent}
            />
          </div>
        </div>

        <div className="pg-gallery">
          {items.map((it, i) => (
            <button
              key={it.id}
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              className="pg-thumb"
              onClick={() => openAt(i)}
            >
              <img src={it.thumbnail ?? it.src} alt={it.alt} loading="lazy" />
            </button>
          ))}
        </div>
      </section>

      <footer className="pg-footer">
        Images from <a href="https://picsum.photos">picsum.photos</a>. Built with{" "}
        <a href={REPO_URL}>@jekrch/react-viewport-lightbox</a>.
      </footer>

      {open && (
        <ImageViewer
          items={items}
          index={index}
          loop={loop}
          zoom={zoom}
          zoomToCursor={zoomToCursor}
          closeOnBackdropClick={closeOnBackdropClick}
          getOriginRect={(i) => thumbRefs.current[i]?.getBoundingClientRect() ?? null}
          onIndexChange={setIndex}
          onNavigate={(dir) => {
            if (drawerOpen) {
              setSlideDir(dir);
              setDrawerOpen(false);
              // Snap the image back to center WITHOUT animating (it's hidden
              // behind the drawer right now) so it slides in purely horizontally
              // instead of dropping down from the top.
              shiftRef.current?.(null, false);
            }
          }}
          onClose={() => {
            setDrawerOpen(false);
            setSlideDir(null);
            setOpen(false);
          }}
          renderHeader={(ctx) => (
            <>
              <p className="rvl-header-title">{ctx.item.alt}</p>
              <p className="rvl-header-subtitle">picsum.photos sample</p>
            </>
          )}
          renderNavStart={(ctx) => (
            <button
              type="button"
              className={`rvl-btn${drawerOpen ? " is-active" : ""}`}
              onClick={() => {
                const next = !drawerOpen;
                setSlideDir(null);
                setDrawerOpen(next);
                // Slide the image up out of view when the drawer opens (animated).
                ctx.setContentShift(next ? "translateY(-100vh)" : null);
              }}
              aria-pressed={drawerOpen}
              title="Show details"
            >
              {drawerOpen ? "Hide details" : "Details"}
            </button>
          )}
          renderOverlay={(ctx) => {
            // Capture the imperative shift setter for the onNavigate handler.
            shiftRef.current = ctx.setContentShift;
            return (
              // Kept mounted so it can slide (up when toggled, sideways when
              // navigating) instead of popping in. The image slides up behind it on
              // open; on navigate the image snaps to center and slides horizontally.
              <div
                aria-hidden={!drawerOpen}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  // Sit between the bars so the drawer fills the viewer body.
                  top: ctx.topBarHeight,
                  bottom: ctx.bottomBarHeight,
                  // Composite the backdrop tint over the page color: pixel-identical
                  // to the area behind the image, but opaque so it fully covers it.
                  background: `linear-gradient(var(--rvl-overlay-bg), var(--rvl-overlay-bg)), ${PAGE_BG}`,
                  color: "#e6e6e6",
                  padding: 24,
                  overflowY: "auto",
                  transform: drawerTransform,
                  transition: instantPark
                    ? "none"
                    : "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)",
                  pointerEvents: drawerOpen ? "auto" : "none",
                }}
              >
                {/* Keep the text from hugging the far-left edge on wide screens. */}
                <div style={{ maxWidth: 640, margin: "0 auto" }}>
                  {/* Details live on the item itself (`ctx.item.data`), so they
                      stay paired with the slide automatically as you navigate. */}
                  <h2 style={{ marginTop: 0 }}>{ctx.item.data?.title}</h2>
                  <p style={{ opacity: 0.85 }}>{ctx.item.data?.body}</p>
                  <p style={{ opacity: 0.5, fontSize: 13 }}>{ctx.item.data?.credit}</p>
                  <p style={{ opacity: 0.7, marginTop: 24 }}>
                    Full-height drawer rendered via <code>renderOverlay</code>. Toggling{" "}
                    <strong>Details</strong> slides the image up out of view (
                    <code>ctx.setContentShift("translateY(-100vh)")</code>) and the drawer up into
                    its place. Navigating while it is open slides the drawer out sideways and snaps
                    the image back to center with <code>setContentShift(null, false)</code>, so the
                    next image slides straight in horizontally, exactly like normal navigation, with
                    no drop from the top. The toggle lives in the <code>renderNavStart</code> slot,
                    pinned left of the nav controls so it costs no extra vertical space.
                  </p>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
