/**
 * Renders the PWA icons from one SVG source.
 *
 * Run with `npm run icons` after changing the artwork below. The output
 * is committed, so a build never depends on this running — and neither
 * does a deploy, which is why sharp is not a declared dependency.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");

/**
 * The mark: a rounded dark tile with a QR-ish glyph over a plate.
 * `padding` is the safe area a maskable icon needs — Android crops to
 * its own shape, and anything outside ~80% of the canvas can be cut.
 */
function svg({ size, padding }) {
  // `padding` is the maskable safe area, on top of which the glyph
  // always keeps its own margin inside the tile — without it the finder
  // squares sit flush to the rounded corners and get clipped.
  const GLYPH_MARGIN = 0.12;
  const inset = size * (padding + GLYPH_MARGIN);
  const inner = size - inset * 2;
  // A gentle radius on the square icons. The maskable one is a full
  // circle because Android crops it to its own shape anyway, and a
  // squircle inside a circle reads as a mistake.
  const radius = padding > 0.05 ? size * 0.5 : size * 0.2;
  const unit = inner / 12;
  const x = (n) => inset + n * unit;

  // Three finder squares and a few modules — a QR code at a glance,
  // legible even at 48px on a home screen.
  const square = (cx, cy) => `
    <rect x="${x(cx)}" y="${x(cy)}" width="${unit * 3.2}" height="${unit * 3.2}"
      rx="${unit * 0.7}" fill="none" stroke="#ffffff" stroke-width="${unit * 0.85}"/>`;
  const dot = (cx, cy, span = 1) => `
    <rect x="${x(cx)}" y="${x(cy)}" width="${unit * span}" height="${unit * span}"
      rx="${unit * 0.25}" fill="#ffffff"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#18181b"/>
  ${square(0.6, 0.6)}
  ${square(8.2, 0.6)}
  ${square(0.6, 8.2)}
  ${dot(1.9, 1.9, 0.9)}
  ${dot(9.5, 1.9, 0.9)}
  ${dot(1.9, 9.5, 0.9)}
  ${dot(5.6, 0.9)}
  ${dot(5.6, 2.6)}
  ${dot(7.3, 4.3)}
  ${dot(5.6, 5.9)}
  ${dot(9.0, 6.2)}
  ${dot(6.6, 8.0)}
  ${dot(8.4, 9.0)}
  ${dot(10.0, 8.0)}
  ${dot(4.6, 10.0)}
  ${dot(6.6, 10.4)}
  ${dot(9.6, 10.4)}
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  // Maskable carries ~14% padding so Android's crop never clips the mark.
  { file: "icon-maskable-512.png", size: 512, padding: 0.14 },
  // Apple ignores the manifest and reads this instead.
  { file: "apple-icon.png", size: 180, padding: 0 },
];

await mkdir(OUT, { recursive: true });

for (const target of TARGETS) {
  const buffer = Buffer.from(svg(target));
  await sharp(buffer).png().toFile(path.join(OUT, target.file));
  console.log(`wrote icons/${target.file}`);
}

// A single source of truth for anything that wants the vector.
await writeFile(path.join(OUT, "icon.svg"), svg({ size: 512, padding: 0 }), "utf8");
console.log("wrote icons/icon.svg");
