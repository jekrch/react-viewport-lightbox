/* global document, Image, btoa, Buffer */
// Regenerates the playground's responsive WebP images from the source JPEGs:
//   playground/images/<name>.jpg  →  <name>-480.webp, -800.webp, -1600.webp
// Files are named by their real width: a target wider than the source is
// capped at the source's width (so a 960px source yields -960.webp), keeping
// the `w` descriptors in the playground's srcSet honest. Encodes with headless Chromium's
// canvas WebP encoder, so it needs no image library beyond the bench's
// playwright-core. Run by hand when a source image changes:
//   node scripts/playground-images.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const DIR = resolve(import.meta.dirname, "../playground/images");
const WIDTHS = [480, 800, 1600];
const QUALITY = 0.8;

const sources = readdirSync(DIR).filter((f) => f.endsWith(".jpg") && !f.endsWith("-thumb.jpg"));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const file of sources) {
    const name = file.replace(/\.jpg$/, "");
    const dataUrl = `data:image/jpeg;base64,${readFileSync(join(DIR, file)).toString("base64")}`;
    const outputs = await page.evaluate(
      async ({ dataUrl, widths, quality }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const results = [];
        for (const target of widths) {
          const width = Math.min(target, img.naturalWidth);
          const height = Math.round((img.naturalHeight * width) / img.naturalWidth);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (const b of bytes) binary += String.fromCharCode(b);
          results.push({ width, base64: btoa(binary) });
        }
        return results;
      },
      { dataUrl, widths: WIDTHS, quality: QUALITY },
    );
    const written = new Set();
    for (const { width, base64 } of outputs) {
      if (written.has(width)) continue;
      written.add(width);
      writeFileSync(join(DIR, `${name}-${width}.webp`), Buffer.from(base64, "base64"));
      console.log(`${name}-${width}.webp  ${Math.round((base64.length * 0.75) / 1024)} KB`);
    }
  }
} finally {
  await browser.close();
}
