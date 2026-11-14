import { useState } from "react";
// The whole demo runs on the `/lazy` entry: the viewer's code loads when the
// page goes idle (or on tile hover), not with this page.
import { ViewerButton, useLightbox, type ViewerItem } from "@jekrch/react-viewport-lightbox/lazy";
import { CodePanel } from "./CodePanel";
import "../src/styles.css";
import "./playground.css";
import trees480 from "./images/trees-480.webp";
import trees800 from "./images/trees-800.webp";
import trees1600 from "./images/trees-1600.webp";
import cat480 from "./images/cat-480.webp";
import cat800 from "./images/cat-800.webp";
import cat1600 from "./images/cat-1600.webp";
import plants480 from "./images/plants-480.webp";
import plants800 from "./images/plants-800.webp";
import plants1600 from "./images/plants-1600.webp";
import buildings480 from "./images/buildings-480.webp";
import buildings800 from "./images/buildings-800.webp";
import buildings1600 from "./images/buildings-1600.webp";
import crane480 from "./images/crane-480.webp";
import crane800 from "./images/crane-800.webp";
import crane1600 from "./images/crane-1600.webp";
import sky480 from "./images/sky-480.webp";
import sky800 from "./images/sky-800.webp";
import sky960 from "./images/sky-960.webp";
import willow480 from "./images/willow-480.webp";
import willow800 from "./images/willow-800.webp";
import willow1600 from "./images/willow-1600.webp";

// Per-slide payload. It lives on each item as `data`, so slots read
// `ctx.item.data` with no parallel lookup keyed by index or id.
interface SlideDetail {
  label: string;
  body: string;
}

/** One photo at three widths: the 480 is the grid tile, the rest feed srcSet. */
const photo = (
  id: string,
  alt: string,
  label: string,
  body: string,
  [small, medium, large]: [string, string, string],
  largeWidth = 1600,
): ViewerItem<SlideDetail> => ({
  id,
  alt,
  thumbnail: small,
  src: large,
  srcSet: `${small} 480w, ${medium} 800w, ${large} ${largeWidth}w`,
  sizes: "100vw",
  data: { label, body },
});

const items: ViewerItem<SlideDetail>[] = [
  photo(
    "trees",
    "Looking up through a tree canopy",
    "Canopy",
    "Shot straight up. The tile crops it square; the viewer opens out of that crop and shows the whole frame.",
    [trees480, trees800, trees1600],
  ),
  photo(
    "cat",
    "A gray cat sitting by a farm fence",
    "Farm cat",
    "Swipe up or down on the image to close it. It follows your finger and lands back in its tile.",
    [cat480, cat800, cat1600],
  ),
  photo(
    "plants",
    "Pothos plants and a lucky cat",
    "Pothos",
    "This drawer is the renderOverlay slot. Opening it sets stageShift, which slides the image up out of the way.",
    [plants480, plants800, plants1600],
  ),
  photo(
    "buildings",
    "Brick towers against a blue sky",
    "Brick towers",
    "With the back button option on, back closes the viewer, and the URL can name this photo (?photo=buildings) so a link opens straight onto it.",
    [buildings480, buildings800, buildings1600],
  ),
  photo(
    "crane",
    "A grey crowned crane in tall grass",
    "Crowned crane",
    "Double-tap or pinch to zoom. The badge in the corner is renderImageOverlay: it stays on the image's own corner.",
    [crane480, crane800, crane1600],
  ),
  photo(
    "sky",
    "Willow branches against a cloudy sky",
    "Willow sky",
    "Phones fetch the 480 or 800 pixel version from srcSet; a wide desktop gets the full size.",
    [sky480, sky800, sky960],
    960,
  ),
  photo(
    "willow",
    "Autumn willow over a rolling field",
    "Autumn willow",
    "Back (or Escape) closes this drawer before it closes the viewer.",
    [willow480, willow800, willow1600],
  ),
];

const HISTORY_PARAM = "photo";
// Built with `--mode embed` to run inside another site's sandboxed frame, where
// the URL isn't the reader's to share: no copy-link button, history starts off.
const EMBEDDED = import.meta.env.MODE === "embed";
const INSTALL_CMD = "npm add @jekrch/react-viewport-lightbox";
const REPO_URL = "https://github.com/jekrch/react-viewport-lightbox";

const FEATURES = [
  {
    title: "Zooms out of the tile",
    body: "Opens from the exact thumbnail you tapped, even one cropped with object-fit: cover, and collapses back into it.",
  },
  {
    title: "Swipe to close",
    body: "Drag the image up or down. It follows your finger, the page shows through, and it lands back in its tile.",
  },
  {
    title: "Drawers that move the image",
    body: "stageShift slides the image aside for a details panel. Back and Escape close the drawer first.",
  },
  {
    title: "Back button & deep links",
    body: "history gives the viewer its own back-stack entry and, optionally, a ?photo= URL you can share.",
  },
  {
    title: "Sharp when you zoom",
    body: "Phones open the small size from your srcSet. Zoom in and a bigger one swaps in once it has decoded.",
  },
  {
    title: "About 1 KB up front",
    body: "From /lazy, the viewer loads when the page goes idle, and each photo starts loading on hover.",
  },
  {
    title: "Zero dependencies",
    body: "React is the only peer. Theme with CSS custom properties; focus trap and reduced motion built in.",
  },
];

const ACCENTS = ["#4c538d", "#7fb069", "#ff5c8a", "#e0913a", "#3aa0c2"];

function urlFor(item: ViewerItem): string {
  const url = new URL(window.location.href);
  url.searchParams.set(HISTORY_PARAM, item.id);
  return url.toString();
}

/** Copy text, falling back for frames where the async clipboard is blocked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" strokeLinecap="round" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function App() {
  const [loop, setLoop] = useState(true);
  const [zoom, setZoom] = useState(true);
  const [zoomToCursor, setZoomToCursor] = useState(true);
  const [wheelZooms, setWheelZooms] = useState(false);
  const [closeOnBackdropClick, setCloseOnBackdropClick] = useState(true);
  const [swipeToClose, setSwipeToClose] = useState(true);
  const [tapToToggleChrome, setTapToToggleChrome] = useState(false);
  const [backButton, setBackButton] = useState(!EMBEDDED);
  const [backSteps, setBackSteps] = useState(false);
  const [badge, setBadge] = useState(true);
  const [hint, setHint] = useState(true);
  const [navHeight, setNavHeight] = useState(38);
  const [navInset, setNavInset] = useState(21);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const copyInstall = async () => {
    if (await copyText(INSTALL_CMD)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // The page's own accent; the viewer gets it through the `accent` option.
  const themeVars = { "--pg-accent": accent } as React.CSSProperties;

  // The whole lightbox: open state, preloading (the viewer's code on idle,
  // each photo on hover/press), the zoom origin, and `?photo=` deep links.
  const lightbox = useLightbox(items, {
    accent,
    loop,
    zoom,
    zoomToCursor,
    wheel: wheelZooms ? "zoom" : "pan",
    closeOnBackdropClick,
    swipeToClose,
    tapToToggleChrome,
    history: backButton ? { param: HISTORY_PARAM, paging: backSteps ? "push" : "replace" } : false,
    hint,
    navHeight,
    navInset,
    stageShift: drawerOpen ? "up" : null,
    // Paging hands the stage back to the next image.
    onNavigate: () => setDrawerOpen(false),
    // Escape and back close the drawer before the viewer.
    onEscape: () => {
      if (!drawerOpen) return false;
      setDrawerOpen(false);
      return true;
    },
    onClose: () => setDrawerOpen(false),
    renderHeader: (ctx) => (
      <>
        <p className="rvl-header-title">{ctx.item.data.label}</p>
        <p className="rvl-header-subtitle">
          {ctx.index + 1} / {ctx.total}
        </p>
      </>
    ),
    renderHeaderActions: (ctx) =>
      EMBEDDED ? null : (
        <ViewerButton
          label={linkCopied ? "Link copied" : "Copy link to this photo"}
          onClick={async () => {
            if (await copyText(urlFor(ctx.item))) {
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 1500);
            }
          }}
        >
          {linkCopied ? <CheckIcon /> : <LinkIcon />}
        </ViewerButton>
      ),
    renderNavStart: () => (
      <ViewerButton
        label={drawerOpen ? "Hide details" : "Show details"}
        active={drawerOpen}
        onClick={() => setDrawerOpen((d) => !d)}
      >
        {drawerOpen ? "Hide details" : "Details"}
      </ViewerButton>
    ),
    renderImageOverlay: badge
      ? (ctx) =>
          ctx.isZoomed ? null : <span className="pg-image-badge">{ctx.item.data.label}</span>
      : undefined,
    renderOverlay: (ctx) => (
      // Kept mounted so it slides instead of popping in. stageShift moves
      // the image up out of view at the same time.
      <div
        className={`pg-drawer${drawerOpen ? " is-open" : ""}`}
        aria-hidden={!drawerOpen}
        style={{ top: ctx.topBarHeight, bottom: ctx.bottomBarHeight }}
      >
        <div className="pg-drawer-inner">
          <h2>{ctx.item.alt}</h2>
          <p>{ctx.item.data.body}</p>
          <p className="pg-drawer-note">
            This is <code>renderOverlay</code>. The image moved out of the way because the viewer
            has <code>stageShift="up"</code> while the drawer is open. Press Escape or back to close
            the drawer first; page to the next photo to hand the stage back.
          </p>
        </div>
      </div>
    ),
  });

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
          A touch-first React lightbox that opens out of your thumbnails, closes with a swipe, and
          makes room for your own drawers and overlays. About 1 KB until someone opens an image.
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
          <h2>Try it</h2>
          <p>Open a photo, then zoom, swipe, drag down to close, and open Details.</p>
        </div>

        <div className="pg-gallery">
          {items.map((it, i) => (
            <button
              key={it.id}
              className="pg-thumb"
              // Opens on click, preloads on hover/press, and marks the tile the
              // image zooms out of. Each open starts with the drawer shut.
              {...lightbox.triggerProps(i, { onClick: () => setDrawerOpen(false) })}
            >
              <img src={it.thumbnail} alt={it.alt} />
              <span className="pg-thumb-label">{it.data.label}</span>
            </button>
          ))}
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
              checked={wheelZooms}
              disabled={!zoom}
              onChange={(e) => setWheelZooms(e.target.checked)}
            />
            Scroll wheel zooms
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={swipeToClose}
              onChange={(e) => setSwipeToClose(e.target.checked)}
            />
            Swipe to close
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={tapToToggleChrome}
              onChange={(e) => setTapToToggleChrome(e.target.checked)}
            />
            Tap hides bars
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
              checked={backButton}
              onChange={(e) => setBackButton(e.target.checked)}
            />
            Back button &amp; link
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={backSteps}
              disabled={!backButton}
              onChange={(e) => setBackSteps(e.target.checked)}
            />
            Back steps through photos
          </label>
          <label className="pg-toggle">
            <input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} />
            Image badge
          </label>
          <label className="pg-toggle">
            <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} />
            Gesture hint
          </label>
          <label className="pg-range">
            <span>Nav size</span>
            <input
              type="range"
              min={14}
              max={56}
              value={navHeight}
              onChange={(e) => setNavHeight(Number(e.target.value))}
            />
            <span className="pg-range-value">{navHeight}px</span>
          </label>
          <label className="pg-range">
            <span>Bottom space</span>
            <input
              type="range"
              min={0}
              max={64}
              value={navInset}
              onChange={(e) => setNavInset(Number(e.target.value))}
            />
            <span className="pg-range-value">{navInset}px</span>
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
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={showCode}
              onChange={(e) => setShowCode(e.target.checked)}
            />
            Show code
          </label>
        </div>

        {/* Kept mounted and animated open/closed via a grid-rows transition so
            the snippet slides in instead of popping. */}
        <div className={`pg-code-wrap${showCode ? " is-open" : ""}`} aria-hidden={!showCode}>
          <div className="pg-code-inner">
            <CodePanel
              loop={loop}
              zoom={zoom}
              zoomToCursor={zoomToCursor}
              wheelZooms={wheelZooms}
              closeOnBackdropClick={closeOnBackdropClick}
              swipeToClose={swipeToClose}
              tapToToggleChrome={tapToToggleChrome}
              history={backButton}
              backSteps={backSteps}
              badge={badge}
              hint={hint}
              navHeight={navHeight}
              navInset={navInset}
              accent={accent}
            />
          </div>
        </div>
      </section>

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

      <footer className="pg-footer">
        Built with <a href={REPO_URL}>@jekrch/react-viewport-lightbox</a>. Photos by jekrch.
      </footer>

      {lightbox.viewer}
    </div>
  );
}
