// Gzip size budget for the published bundle. Run after `npm run build`.
// Budgets sit a little above the current size so real growth fails CI and
// gets a conscious bump here instead of creeping in.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGETS = [
  { file: "dist/index.js", maxGzip: 15 * 1024 },
  { file: "dist/styles.css", maxGzip: 2.25 * 1024 },
];

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
let failed = false;

for (const { file, maxGzip } of BUDGETS) {
  let source;
  try {
    source = readFileSync(file);
  } catch {
    console.error(`✗ ${file} not found; run \`npm run build\` first`);
    failed = true;
    continue;
  }
  const gz = gzipSync(source).length;
  const ok = gz <= maxGzip;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${kb(gz)} gzip (budget ${kb(maxGzip)})`);
}

if (failed) process.exit(1);
