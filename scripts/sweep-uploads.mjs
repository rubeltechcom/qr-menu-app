/**
 * Reclaim uploaded files that no menu row refers to any more.
 *
 * Photos are normally deleted the moment they are replaced or cleared,
 * so this is the backstop for the one leak that cannot be closed at the
 * point of use: an upload that succeeded but was never saved onto a
 * dish, because the owner closed the tab or lost signal.
 *
 * Usage:
 *   npm run storage:sweep -- --dry-run     report only, delete nothing
 *   npm run storage:sweep                  delete orphans over 24h old
 *   npm run storage:sweep -- --hours 72
 *
 * Local-disk installs only. Under S3, use a bucket lifecycle rule.
 *
 * Written as plain .mjs against PrismaClient, matching seed-demo.mjs, so
 * it needs no TypeScript loader and no extra dependency.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const hoursIndex = args.indexOf("--hours");
const olderThanHours = hoursIndex === -1 ? 24 : Number(args[hoursIndex + 1] ?? 24);

const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIR || path.join(process.cwd(), "var", "uploads"),
);

/** Mirrors isSafeKey() in src/modules/storage/key.ts. */
const KEY_PATTERN =
  /^t\/[a-z0-9]+\/(menuItem|category)\/\d{4}\/\d{2}\/[a-z0-9]+\.(jpg|jpeg|png|webp|avif)$/;

const prisma = new PrismaClient();

/** Recover a key from a stored URL, or null when it is not a local one. */
function keyFromUrl(url) {
  if (typeof url !== "string") return null;
  const withoutPrefix = url.replace(/^.*\/api\/uploads\//, "").replace(/^\/+/, "");
  return KEY_PATTERN.test(withoutPrefix) ? withoutPrefix : null;
}

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".tmp") continue;
      yield* walk(absolute);
    } else {
      yield absolute;
    }
  }
}

async function main() {
  // Every reference, across every tenant, including soft-deleted rows —
  // a soft-deleted dish must keep its photo so a restore is not blank.
  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({ select: { images: true } }),
    prisma.category.findMany({ select: { imageUrl: true } }),
  ]);

  const referenced = new Set();
  for (const item of items) {
    for (const url of item.images) {
      const key = keyFromUrl(url);
      if (key) referenced.add(key);
    }
  }
  for (const category of categories) {
    const key = keyFromUrl(category.imageUrl);
    if (key) referenced.add(key);
  }

  const cutoff = Date.now() - olderThanHours * 3600 * 1000;
  let scanned = 0;
  let inUse = 0;
  let tooRecent = 0;
  const orphans = [];

  for await (const absolute of walk(UPLOAD_ROOT)) {
    const key = path.relative(UPLOAD_ROOT, absolute).split(path.sep).join("/");
    if (!KEY_PATTERN.test(key)) continue; // never touch a file we cannot parse

    scanned += 1;
    if (referenced.has(key)) {
      inUse += 1;
      continue;
    }

    const stats = await stat(absolute).catch(() => null);
    // A file written moments ago may belong to a form still open on
    // someone's phone. Deleting it would be a race we would lose.
    if (!stats || stats.mtimeMs > cutoff) {
      tooRecent += 1;
      continue;
    }

    orphans.push({ key, absolute });
  }

  console.log(`Upload directory: ${UPLOAD_ROOT}`);
  console.log(`Scanned:          ${scanned}`);
  console.log(`Still in use:     ${inUse}`);
  console.log(`Too recent:       ${tooRecent}`);
  console.log(`${dryRun ? "Would delete:" : "Deleting:    "}     ${orphans.length}`);

  for (const orphan of orphans) {
    if (!dryRun) await rm(orphan.absolute, { force: true });
    console.log(`  ${dryRun ? "would delete" : "deleted"} ${orphan.key}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
