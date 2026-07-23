/**
 * Generates PWA icons from inline SVG. Run: pnpm gen:icons
 *
 * Two variants, because they are genuinely different problems:
 *  - "any"      — rounded-square app icon, drawn edge to edge
 *  - "maskable" — full-bleed background with the glyph inside the safe zone
 *                 (the centre 80%), since the OS may crop it to a circle,
 *                 a squircle, or a rounded rect depending on the launcher.
 *
 * Shipping only "any" icons is the usual mistake: Android then crops the
 * artwork and the glyph loses its corners.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(import.meta.dirname, "..", "public", "icons");

const ACCENT = "#6B5FD6";
const ACCENT_LIGHT = "#B9A6F0";
const PAPER = "#FFFFFF";

/** @param {{maskable: boolean}} opts */
function svg({ maskable }) {
  // Safe zone: keep the glyph within the centre 80% for maskable icons.
  const s = maskable ? 0.56 : 0.72;
  const g = 512 * s;
  const o = (512 - g) / 2;
  const radius = maskable ? 0 : 112;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT_LIGHT}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${o} ${o})">
    <rect width="${g}" height="${g}" rx="${g * 0.16}" fill="${PAPER}" opacity="0.96"/>
    <g stroke="${ACCENT}" stroke-width="${g * 0.075}" stroke-linecap="round" opacity="0.85">
      <line x1="${g * 0.22}" y1="${g * 0.33}" x2="${g * 0.78}" y2="${g * 0.33}"/>
      <line x1="${g * 0.22}" y1="${g * 0.52}" x2="${g * 0.66}" y2="${g * 0.52}"/>
      <line x1="${g * 0.22}" y1="${g * 0.71}" x2="${g * 0.5}" y2="${g * 0.71}"/>
    </g>
  </g>
</svg>`;
}

await mkdir(OUT, { recursive: true });

const jobs = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "maskable-192.png", size: 192, maskable: true },
  { name: "maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
];

for (const { name, size, maskable } of jobs) {
  const buf = Buffer.from(svg({ maskable }));
  await sharp(buf).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

// Favicon as SVG — scales perfectly and costs ~600 bytes.
await writeFile(path.join(OUT, "favicon.svg"), svg({ maskable: false }));
console.log("✓ favicon.svg");
