import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Renders every app icon from the two SVG sources.
 *
 * Run with `npm run icons` after editing public/icons/icon.svg or
 * icon-maskable.svg. Checking the PNGs in rather than generating at
 * build time is deliberate: they are small, they change rarely, and a
 * build that depends on a native image library is a build that breaks
 * on someone else's machine.
 *
 * Sizes are what the platforms actually ask for:
 *   - 16/32/48        favicon, and the .ico that wraps them
 *   - 120             Google's OAuth consent screen
 *   - 180             apple-touch-icon (iOS home screen)
 *   - 192/512         PWA manifest
 *   - maskable 512    Android, which crops to its own shape
 */

const ICONS_DIR = join(process.cwd(), "public", "icons");

/** High density so the vector is rasterised cleanly, then resized down. */
const DENSITY = 600;

const STANDARD = [
  { size: 16, name: "icon-16.png" },
  { size: 32, name: "icon-32.png" },
  { size: 48, name: "icon-48.png" },
  { size: 120, name: "icon-120.png" },
  { size: 180, name: "apple-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

const MASKABLE = [{ size: 512, name: "icon-maskable-512.png" }];

async function render(svg, targets) {
  for (const { size, name } of targets) {
    // A fresh sharp instance per size: reusing one after resize()
    // carries the previous dimensions.
    const buffer = await sharp(svg, { density: DENSITY })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(join(ICONS_DIR, name), buffer);
    console.log(`  ${name.padEnd(26)} ${size}x${size}  ${buffer.length} bytes`);
  }
}

/**
 * The browser-tab favicon, as a real .ico wrapping three sizes.
 *
 * Windows and older browsers still expect .ico, and sharp has no
 * encoder for it — the format is just a small header followed by
 * whole PNGs, so it is written here directly.
 */
async function writeFavicon(svg) {
  const sizes = [16, 32, 48];

  const pngs = [];
  for (const size of sizes) {
    pngs.push(
      await sharp(svg, { density: DENSITY })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + sizes.length * 16;

  for (const [index, size] of sizes.entries()) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // width
    entry.writeUInt8(size, 1); // height
    entry.writeUInt8(0, 2); // palette entries
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[index].length;
    entries.push(entry);
  }

  const ico = Buffer.concat([header, ...entries, ...pngs]);
  // Next.js serves src/app/favicon.ico at /favicon.ico automatically.
  await writeFile(join(process.cwd(), "src", "app", "favicon.ico"), ico);
  console.log(`  favicon.ico               ${sizes.join("/")}      ${ico.length} bytes`);
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const icon = await readFile(join(ICONS_DIR, "icon.svg"));
  const maskable = await readFile(join(ICONS_DIR, "icon-maskable.svg"));

  console.log("Standard icons:");
  await render(icon, STANDARD);

  console.log("Maskable (Android):");
  await render(maskable, MASKABLE);

  console.log("Browser tab:");
  await writeFavicon(icon);
}

main().catch((error) => {
  console.error(`[icons] ${error.message}`);
  process.exit(1);
});
