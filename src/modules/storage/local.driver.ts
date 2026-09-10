import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile, readdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@/lib/env";
import { UPLOAD_URL_PREFIX, isSafeKey } from "./key";
import type {
  ListedObject,
  PutParams,
  ReadResult,
  StorageDriver,
  StorageKey,
} from "./provider";

/**
 * Files on the server's own disk.
 *
 * This is the default, and on a single-server install (Coolify, a VPS,
 * a machine in the restaurant's back office) it is also the right answer
 * in production — object storage buys nothing until there is more than
 * one app container or a CDN in front.
 *
 * The one hard requirement is that UPLOAD_DIR points somewhere that
 * survives a redeploy. Inside Docker that means a mounted volume; a path
 * inside the image is wiped every time the app is rebuilt, and because
 * the database rows survive, the failure looks like a menu full of
 * broken images rather than an error anyone would notice at deploy time.
 * assertWritable() below is what turns that into a loud startup failure.
 */

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/** Where uploads live. Resolved once, absolute from here on. */
export function uploadRoot(): string {
  return path.resolve(env.UPLOAD_DIR ?? path.join(process.cwd(), "var", "uploads"));
}

/**
 * A key's absolute path on this machine.
 *
 * Keys are POSIX by definition, so they are split on "/" and rejoined
 * with the platform separator — never concatenated. After resolving,
 * the result is checked to still be inside the upload root: keys are
 * server-generated and already pattern-checked, so this should be
 * unreachable, and that is exactly why it is worth asserting.
 */
function absolutePathFor(key: string): string {
  if (!isSafeKey(key)) {
    throw new Error("Refusing to resolve an unsafe storage key");
  }
  const root = uploadRoot();
  const resolved = path.resolve(root, ...key.split("/"));

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Refusing to resolve a storage key outside the upload root");
  }
  return resolved;
}

export const localDriver: StorageDriver = {
  id: "LOCAL",
  displayName: "Local disk",

  // Always available: worst case the directory does not exist yet, and
  // put() creates it.
  isConfigured: () => true,

  async put({ key, body, contentType }: PutParams) {
    const destination = absolutePathFor(key);
    await mkdir(path.dirname(destination), { recursive: true });

    // Write to a temporary name and rename into place, so a crash or a
    // full disk mid-write can never leave a half-written JPEG that the
    // storefront would render as a broken image. The temp file lives
    // inside the upload root because rename() cannot cross volumes on
    // Windows, and the root may well be a mounted volume.
    const temporaryDir = path.join(uploadRoot(), ".tmp");
    await mkdir(temporaryDir, { recursive: true });
    const temporary = path.join(temporaryDir, `${createId()}.part`);

    try {
      await writeFile(temporary, body);
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }

    void contentType; // implied by the key's extension on this driver
    return { key, url: this.publicUrl(key), bytes: body.byteLength };
  },

  async delete(key: StorageKey) {
    // `force` makes a missing file a no-op: deletion is retried by the
    // orphan sweeper and must be safe to repeat.
    await rm(absolutePathFor(key), { force: true });
  },

  async exists(key: StorageKey) {
    try {
      await access(absolutePathFor(key), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },

  publicUrl(key: StorageKey) {
    const base = env.UPLOAD_PUBLIC_BASE?.replace(/\/+$/, "") ?? "";
    return `${base}${UPLOAD_URL_PREFIX}/${key}`;
  },

  async read(key: StorageKey): Promise<ReadResult> {
    const absolute = absolutePathFor(key);
    const stats = await stat(absolute);
    const extension = key.split(".").pop() ?? "";

    return {
      // Streamed rather than buffered: a dozen tablets loading a menu
      // should not each cost a megabyte of server memory.
      stream: Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>,
      bytes: stats.size,
      contentType: CONTENT_TYPE[extension] ?? "application/octet-stream",
      // Size and mtime are enough to detect a change, and keys are never
      // overwritten in the first place, so this is stable.
      etag: `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`,
    };
  },

  async *list(prefix: string): AsyncIterable<ListedObject> {
    const root = uploadRoot();
    const start = path.resolve(root, ...prefix.split("/").filter(Boolean));

    if (start !== root && !start.startsWith(root + path.sep)) return;

    yield* walk(start, root);
  },

  async assertWritable() {
    const root = uploadRoot();
    const probe = path.join(root, ".tmp", `probe-${createId()}`);

    try {
      await mkdir(path.dirname(probe), { recursive: true });
      await writeFile(probe, "ok");
      await rm(probe, { force: true });
    } catch (cause) {
      throw new Error(
        `Cannot write uploads to ${root}. ` +
          `Set UPLOAD_DIR to a writable directory. In Docker this must be a ` +
          `mounted volume owned by the runtime user ` +
          `(e.g. RUN mkdir -p /data/uploads && chown -R node:node /data), ` +
          `otherwise uploaded photos are lost on every redeploy.`,
        { cause },
      );
    }
  },
};

/** Depth-first walk yielding only well-formed keys. */
async function* walk(directory: string, root: string): AsyncIterable<ListedObject> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return; // never created, or removed under us
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".tmp") continue;
      yield* walk(absolute, root);
      continue;
    }

    // Anything that is not a valid key is ignored rather than reported —
    // the sweeper must never be tricked into deleting a stray file it
    // does not understand.
    const key = path.relative(root, absolute).split(path.sep).join("/");
    if (!isSafeKey(key)) continue;

    const stats = await stat(absolute).catch(() => null);
    if (!stats) continue;

    yield { key: key as StorageKey, bytes: stats.size, modifiedAt: stats.mtime };
  }
}
