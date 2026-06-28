import { useEffect, useRef, useState } from "react";
import {
  ImageViewer,
  type ViewerContext,
  type ViewerItem,
} from "@jekrch/react-viewport-lightbox";
import "../src/styles.css";

const items: ViewerItem[] = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  src: `https://picsum.photos/id/${10 + i}/1600/1000`,
  thumbnail: `https://picsum.photos/id/${10 + i}/240/150`,
  alt: `Demo image ${i + 1}`,
}));

const PAGE_BG = "#0b0b0c";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  margin: 0,
  background: PAGE_BG,
  color: "#e6e6e6",
  fontFamily: "system-ui, sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "center",
  padding: 32,
};

export function App() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [loop, setLoop] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // When navigating with the drawer open, it slides out sideways with the image.
  const [slideDir, setSlideDir] = useState<"prev" | "next" | null>(null);
  // Suppresses the transition for one frame so re-parking the drawer (from
  // off-the-side back to off-the-bottom) snaps instantly instead of sweeping
  // diagonally across the viewport.
  const [instantPark, setInstantPark] = useState(false);
  // Captured from a render slot so the onNavigate handler can reset the shift.
  const shiftRef = useRef<ViewerContext["setContentShift"] | null>(null);

  // Once the new index has landed (slide finished), re-park the drawer at the
  // bottom WITHOUT animating — both positions are off-screen, so the user never
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

  // Closed drawer is parked off the bottom; navigating slides it out in the
  // swipe direction (image moves left on "next", so the drawer exits left).
  const drawerTransform = slideDir
    ? `translateX(${slideDir === "next" ? "-100%" : "100%"})`
    : drawerOpen
      ? "translateY(0)"
      : "translateY(100vh)";

  return (
    <div style={pageStyle}>
      <h1 style={{ fontWeight: 600 }}>react-viewport-lightbox playground</h1>
      <label style={{ opacity: 0.7, fontSize: 14 }}>
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 800 }}>
        {items.map((it, i) => (
          <button
            key={it.id}
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
            style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}
          >
            <img
              src={it.thumbnail ?? it.src}
              alt={it.alt}
              style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 6 }}
            />
          </button>
        ))}
      </div>

      {open && (
        <ImageViewer
          items={items}
          index={index}
          loop={loop}
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
              <h2 style={{ marginTop: 0 }}>{ctx.item.alt}</h2>
              <p style={{ opacity: 0.7, maxWidth: 640 }}>
                Full-height drawer rendered via <code>renderOverlay</code>. Toggling{" "}
                <strong>Details</strong> slides the image up out of view (
                <code>ctx.setContentShift("translateY(-100vh)")</code>) and the drawer up into its
                place. Navigating while it is open slides the drawer out sideways and snaps the image
                back to center with <code>setContentShift(null, false)</code> — so the next image
                slides straight in horizontally, exactly like normal navigation, with no drop from the
                top. The toggle lives in the <code>renderNavStart</code> slot, pinned left of the nav
                controls so it costs no extra vertical space.
              </p>
            </div>
            );
          }}
        />
      )}
    </div>
  );
}
