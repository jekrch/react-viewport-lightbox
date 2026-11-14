# Drawers and `stageShift`

[← README](../../README.md) · [All guides](README.md)

To slide the image out of the way for a drawer, describe where the stage should be
and the viewer animates it there:

```tsx
<ImageViewer
  {...props}
  stageShift={drawerOpen ? "up" : null}
  onNavigate={() => setDrawerOpen(false)}
  renderNavStart={() => (
    <ViewerButton label="Details" active={drawerOpen} onClick={() => setDrawerOpen((d) => !d)}>
      <InfoIcon />
    </ViewerButton>
  )}
  renderOverlay={(ctx) => <MyDrawer open={drawerOpen} item={ctx.item} />}
/>
```

A viewer that mounts with `stageShift` already set (opened straight onto the
details) starts in place rather than sliding there. While shifted, the zoom
controls hide and closing fades rather than collapsing into the thumbnail, since
the image is off screen.

Closing the drawer from `onNavigate` (as above) is the one other change that
doesn't animate: a shift cleared as a slide starts snaps the stage back to
center, so the next image slides straight in horizontally instead of dropping
from the top. The drawer that's leaving still covers the jump. A partial shift
(say `"translateY(-40vh)"` for a peek drawer) that you keep through navigation
just stays put.

Here's the fuller version plantyJ uses: a Details toggle pinned left of the nav
controls, and a drawer that slides out sideways with the image when you page
while it's open. Keep the drawer mounted so it animates its own `transform`:

```tsx
const [drawer, setDrawer] = useState(false);
const [slideDir, setSlideDir] = useState<"prev" | "next" | null>(null);

// After the slide lands, re-park the drawer at the bottom without animating
// (both positions are off-screen, so it snaps invisibly).
const [instant, setInstant] = useState(false);
useEffect(() => {
  if (slideDir) {
    setInstant(true);
    setSlideDir(null);
  }
}, [index]);
useEffect(() => {
  if (!instant) return;
  const r = requestAnimationFrame(() => setInstant(false));
  return () => cancelAnimationFrame(r);
}, [instant]);

const transform = slideDir
  ? `translateX(${slideDir === "next" ? "-100%" : "100%"})`
  : drawer
    ? "translateY(0)"
    : "translateY(100vh)";

<ImageViewer
  items={items}
  index={index}
  onIndexChange={setIndex}
  stageShift={drawer ? "up" : null}
  onNavigate={(dir) => {
    if (drawer) {
      setSlideDir(dir);
      setDrawer(false); // the stage snaps back to center (see above)
    }
  }}
  onClose={() => setOpen(false)}
  renderNavStart={() => (
    <ViewerButton
      label="Details"
      active={drawer}
      onClick={() => {
        setSlideDir(null);
        setDrawer((d) => !d);
      }}
    >
      <InfoIcon />
    </ViewerButton>
  )}
  renderOverlay={(ctx) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: ctx.topBarHeight, // size between the measured bars
        bottom: ctx.bottomBarHeight,
        // opaque, but pixel-identical to the area behind the image
        background: `linear-gradient(var(--rvl-overlay-bg), var(--rvl-overlay-bg)), ${PAGE_BG}`,
        transform,
        transition: instant ? "none" : "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)",
        pointerEvents: drawer ? "auto" : "none",
      }}
    >
      <MyDrawerContents item={ctx.item} />
    </div>
  )}
/>;
```

`renderNavStart` keeps the prev/counter/next group optically centered, so the
toggle adds no vertical space.
