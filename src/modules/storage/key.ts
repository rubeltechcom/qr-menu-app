import { createId } from "@paralleldrive/cuid2";
import type { ImageType, StorageKey, UploadKind } from "./provider";

/**
 * Storage key construction and validation.
 *
 * This file is pure — no filesystem, no environment, no database — so
 * the rules that keep one restaurant's files away from another's, and
 * keep a crafted key from escaping the upload directory, can be tested
 * directly and exhaustively.
 *
 * The security posture is "generate, don't sanitise": a key is built
 * from a tenant id, a fixed enum and a freshly generated cuid2. The
 * uploader's filename is discarded entirely rather than cleaned up, so
 * there is no sanitisation routine to get subtly wrong.
 */

/** Where a key's public URL lives under the local driver. */
export const UPLOAD_URL_PREFIX = "/api/uploads";

const EXTENSION: Record<ImageType, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

const TYPE_FOR_EXTENSION: Record<string, ImageType> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

const KINDS: readonly UploadKind[] = ["menuItem", "category"];

/**
 * The only shape a key may take.
 *
 * Anchored at both ends, with no character class that can express a
 * path separator, a parent-directory hop, a drive letter, or an NTFS
 * alternate data stream (`photo.jpg:payload.exe`). Windows' own
 * hazards — trailing dots and spaces, and the reserved device names
 * CON/PRN/AUX/NUL/COM1-9/LPT1-9 — are excluded for the same reason:
 * the segments are a cuid2 and a fixed extension, neither of which can
 * produce one, and the pattern makes that a guarantee rather than a
 * coincidence a later change could break.
 */
const KEY_PATTERN =
  /^t\/[a-z0-9]+\/(menuItem|category)\/\d{4}\/\d{2}\/[a-z0-9]+\.(jpg|jpeg|png|webp|avif)$/;

export interface ParsedKey {
  tenantId: string;
  kind: UploadKind;
  type: ImageType;
}

/** True only for a string matching the documented key shape exactly. */
export function isSafeKey(raw: string): boolean {
  return KEY_PATTERN.test(raw);
}

/**
 * A new key for a file about to be written.
 *
 * The date folders keep any one directory from growing to tens of
 * thousands of entries, which matters when the orphan sweeper walks the
 * tree on a spinning disk or over NTFS.
 */
export function buildKey(input: {
  tenantId: string;
  kind: UploadKind;
  type: ImageType;
  now?: Date;
}): StorageKey {
  const now = input.now ?? new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `t/${input.tenantId}/${input.kind}/${year}/${month}/${createId()}.${EXTENSION[input.type]}`;

  // The tenant id is the one component that comes from outside this
  // function. It is a cuid from our own database rather than user input,
  // but a key that does not match the pattern must never reach a driver,
  // so this is checked rather than assumed.
  if (!isSafeKey(key)) {
    throw new Error("Refusing to build a malformed storage key");
  }
  return key as StorageKey;
}

/** Structured form of a key, or null when the string is not a valid one. */
export function parseKey(raw: string): ParsedKey | null {
  if (!isSafeKey(raw)) return null;

  const [, tenantId, kind, , , filename] = raw.split("/");
  const extension = filename?.split(".").pop();
  const type = extension ? TYPE_FOR_EXTENSION[extension] : undefined;

  if (!tenantId || !kind || !type || !KINDS.includes(kind as UploadKind)) {
    return null;
  }
  return { tenantId, kind: kind as UploadKind, type };
}

/**
 * Whether a key belongs to the given tenant.
 *
 * Checked before every delete, and before any URL is written to a row —
 * it is what stops one restaurant attaching (or removing) another's
 * photo by pasting its URL into a form.
 */
export function keyBelongsToTenant(raw: string, tenantId: string): boolean {
  return parseKey(raw)?.tenantId === tenantId;
}

/**
 * Recover the key from a stored URL, or null if it is not one of ours.
 *
 * Handles both the same-origin local form and an absolute URL (a CDN
 * prefix, or an S3 public base). Anything else — an external image
 * someone pasted, a `javascript:` URL — yields null and is rejected by
 * the caller rather than stored.
 */
export function keyFromUrl(url: string, publicBases: string[] = []): StorageKey | null {
  let path = url;

  for (const base of publicBases) {
    if (base && url.startsWith(base)) {
      path = url.slice(base.length);
      break;
    }
  }

  // An absolute URL that matched no known base is not ours.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return null;

  if (path.startsWith(UPLOAD_URL_PREFIX)) {
    path = path.slice(UPLOAD_URL_PREFIX.length);
  }
  path = path.replace(/^\/+/, "");

  return isSafeKey(path) ? (path as StorageKey) : null;
}
