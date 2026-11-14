// Fixture for `npm run bench` (scripts/bench.mjs). A large, scrolled gallery
// page, so costs that scale with the host document (style recalc, layout)
// show up the way they did on plantyJ's wall. Marks phases with
// performance.mark() for the trace; nothing here is visual.
import { memo, StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageViewer, originFromAttribute, type ViewerItem } from "../src/index";
import "../src/styles.css";
import "./bench.css";
import trees from "../playground/images/trees.jpg";
import treesThumb from "../playground/images/trees-thumb.jpg";
import plants from "../playground/images/plants.jpg";
import plantsThumb from "../playground/images/plants-thumb.jpg";
import sky from "../playground/images/sky.jpg";
import skyThumb from "../playground/images/sky-thumb.jpg";
import cat from "../playground/images/cat.jpg";
import catThumb from "../playground/images/cat-thumb.jpg";
import buildings from "../playground/images/buildings.jpg";
import buildingsThumb from "../playground/images/buildings-thumb.jpg";
import crane from "../playground/images/crane.jpg";
import craneThumb from "../playground/images/crane-thumb.jpg";
import willow from "../playground/images/willow.jpg";
import willowThumb from "../playground/images/willow-thumb.jpg";

const SOURCES = [
  [trees, treesThumb],
  [plants, plantsThumb],
  [sky, skyThumb],
  [cat, catThumb],
  [buildings, buildingsThumb],
  [crane, craneThumb],
  [willow, willowThumb],
];

const TILE_COUNT = 600;

const items: ViewerItem[] = Array.from({ length: TILE_COUNT }, (_, i) => {
  const [src, thumbnail] = SOURCES[i % SOURCES.length];
  return { id: String(i), src, thumbnail, alt: `Photo ${i}` };
});

const getOrigin = originFromAttribute("data-tile");

// Memoized so opening the viewer doesn't re-render 600 tiles: the bench
// should time the library, not this fixture.
const Grid = memo(function Grid({ onOpen }: { onOpen: (index: number) => void }) {
  return (
    <main className="bench-grid">
      {items.map((item, i) => (
        <figure key={item.id} className="bench-tile">
          <button
            type="button"
            data-tile={item.id}
            onClick={() => {
              performance.mark("rvl:open-start");
              onOpen(i);
            }}
          >
            <img src={item.thumbnail} alt={item.alt} />
          </button>
          <figcaption>
            <strong>{item.alt}</strong> <span>#{i}</span>
          </figcaption>
        </figure>
      ))}
    </main>
  );
});

function Bench() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const onOpen = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);

  return (
    <>
      <header className="bench-header">rvl bench · {TILE_COUNT} tiles</header>
      <Grid onOpen={onOpen} />
      {open && (
        <ImageViewer
          items={items}
          index={index}
          onIndexChange={(i) => {
            performance.mark("rvl:navigated");
            setIndex(i);
          }}
          getOrigin={getOrigin}
          onOpenComplete={() => performance.mark("rvl:open-end")}
          onCloseStart={() => performance.mark("rvl:close-start")}
          onClose={() => {
            performance.mark("rvl:close-end");
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  // Production build: StrictMode's double effects are dev-only, so this costs
  // nothing in the numbers but keeps the fixture honest about cleanup.
  <StrictMode>
    <Bench />
  </StrictMode>,
);
