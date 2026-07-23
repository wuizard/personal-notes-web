/**
 * Generates PWA icons from the brand system. Run: pnpm gen:icons
 *
 * The brand files in `notes-maker-vector-brand-system/` are the source of
 * truth — this script only rasterises them. It used to draw its own
 * approximation of the mark (0.72 scale, 0.16 radius, 0.075 stroke), which
 * happened to look close but violated the brand guide's "do not alter
 * individual line lengths, corner radii, or the gradient" rule. Redrawing a
 * logo in code is how a brand quietly drifts.
 *
 * Two variants, because they are genuinely different problems:
 *  - "any"      — the rounded app icon, drawn edge to edge
 *  - "maskable" — the SQUARE (full-bleed) icon, because the OS crops maskable
 *                 icons to a circle or squircle of its choosing. Feeding it the
 *                 rounded artwork would clip the corners twice.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const HERE = import.meta.dirname;
const BRAND = path.join(HERE, "..", "..", "notes-maker-vector-brand-system");
const OUT = path.join(HERE, "..", "public", "icons");

const ROUNDED = path.join(BRAND, "04-app-icons", "notes-maker-app-icon-rounded.svg");
const SQUARE = path.join(BRAND, "04-app-icons", "notes-maker-app-icon-square.svg");
const FAVICON_SVG = path.join(BRAND, "06-favicon", "favicon.svg");
const FAVICON_ICO = path.join(BRAND, "06-favicon", "favicon.ico");

await mkdir(OUT, { recursive: true });

const jobs = [
  { src: ROUNDED, name: "icon-192.png", size: 192 },
  { src: ROUNDED, name: "icon-512.png", size: 512 },
  { src: ROUNDED, name: "apple-touch-icon.png", size: 180 },
  { src: SQUARE, name: "maskable-192.png", size: 192 },
  { src: SQUARE, name: "maskable-512.png", size: 512 },
];

for (const { src, name, size } of jobs) {
  const svg = await readFile(src);
  // `density` matters: sharp rasterises SVG at 72dpi by default, so a 512px
  // target rendered from a 512-unit viewBox would be resampled from a small
  // bitmap and come out soft.
  await sharp(svg, { density: Math.ceil((size / 512) * 72 * 4) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
  console.log(`✓ ${name} (${size}×${size})  ← ${path.basename(src)}`);
}

// The SVG favicon is copied verbatim — it is already the brand master, and
// re-encoding a vector only risks changing it.
await copyFile(FAVICON_SVG, path.join(OUT, "favicon.svg"));
console.log("✓ favicon.svg  ← brand master (copied verbatim)");

await copyFile(FAVICON_ICO, path.join(OUT, "favicon.ico"));
console.log("✓ favicon.ico  ← brand master (copied verbatim)");
