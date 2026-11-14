// Gzip size budget for the published bundle. Run after `npm run build`.
// Budgets sit a little above the current size so real growth fails CI and
// gets a conscious bump here instead of creeping in.
//
// The ESM build is code-split, so each entry is re-bundled (and re-minified)
// with its chunks, the way a consumer's bundler would. Summing the raw files
// instead would count the chunks' import/export glue, which bundlers remove.
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const external = ["react", "react-dom", "react/jsx-runtime"];

/**
 * Bundle an ESM entry with its static chunks; dynamic-import chunks stay out.
 * With `names`, bundle only those imports from it, as a consumer that uses
 * just them would (the rest is tree-shaken).
 */
async function bundled(entry, names) {
  const result = await build({
    ...(names
      ? {
          stdin: {
            contents: `import { ${names} } from "./${entry}"; console.log(${names});`,
            resolveDir: process.cwd(),
          },
        }
      : { entryPoints: [entry] }),
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    logLevel: "silent",
    external,
    plugins: [
      {
        // Keep lazily loaded chunks out of the entry's own cost.
        name: "dynamic-external",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.kind === "dynamic-import" ? { path: args.path, external: true } : undefined,
          );
        },
      },
    ],
  });
  return result.outputFiles[0].contents;
}

/** The chunk `/lazy` loads on demand. */
const viewerChunk = () => {
  const file = readdirSync("dist").find((f) => /^ImageViewer-.*\.js$/.test(f));
  if (!file) throw new Error("no ImageViewer chunk in dist/");
  return bundled(`dist/${file}`);
};

const BUDGETS = [
  // `import … from "@jekrch/react-viewport-lightbox"`
  { label: "index", load: () => bundled("dist/index.js"), maxGzip: 18 * 1024 },
  // `import … from "@jekrch/react-viewport-lightbox/lazy"`: lands in the
  // consumer's main bundle, so it must stay tiny.
  { label: "lazy (main bundle)", load: () => bundled("dist/lazy.js"), maxGzip: 1.5 * 1024 },
  // The recommended path on its own: what `useLightbox` from `/lazy` costs up front.
  {
    label: "lazy useLightbox (main bundle)",
    load: () => bundled("dist/lazy.js", "useLightbox"),
    maxGzip: 1.25 * 1024,
  },
  // What `/lazy` fetches on first open or preloadViewer().
  { label: "lazy (viewer chunk)", load: viewerChunk, maxGzip: 17 * 1024 },
  { label: "styles.css", load: () => readFileSync("dist/styles.css"), maxGzip: 2.5 * 1024 },
];

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
let failed = false;

for (const { label, load, maxGzip } of BUDGETS) {
  let source;
  try {
    source = await load();
  } catch (error) {
    console.error(`✗ ${label}: ${error.message}; run \`npm run build\` first?`);
    failed = true;
    continue;
  }
  const gz = gzipSync(source).length;
  const ok = gz <= maxGzip;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${kb(gz)} gzip (budget ${kb(maxGzip)})`);
}

if (failed) process.exit(1);
