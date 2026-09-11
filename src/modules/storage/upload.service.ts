import { env } from "@/lib/env";
import { getNumberSetting } from "@/modules/platform/settings.service";
import { buildKey, keyBelongsToTenant, keyFromUrl } from "./key";
import { getStorageDriver } from "./registry";
import { isVideoType, readDimensions, sniffMediaType } from "./sniff";
import type { StoredObject, UploadKind } from "./provider";

/**
 * Accepting one uploaded image.
 *
 * Everything the browser claims about a file — its name, its declared
 * Content-Type, its size header — is treated as decoration. The type is
 * read from the bytes, the key is generated here, and the tenant comes
 * from the caller's authenticated membership. Nothing in the request
 * body influences where the file lands.
 */

export type UploadErrorCode =
  | "NO_FILE"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "TOO_MANY_PIXELS"
  | "STORAGE_FAILED";

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly code: UploadErrorCode,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Largest edge we will accept, in pixels.
 *
 * A 12000px photo is not a menu photo; it is either a mistake or a
 * decompression bomb aimed at whatever eventually decodes it. Checked
 * from the header, without decoding anything.
 */
const MAX_EDGE_PIXELS = 12_000;

/** The size caps, which the operator can change in the admin panel. */
export function maxImageBytes(): number {
  return getNumberSetting("uploads.maxImageMb", 8) * 1024 * 1024;
}

export function maxVideoBytes(): number {
  return getNumberSetting("uploads.maxVideoMb", 20) * 1024 * 1024;
}

export async function uploadImage(params: {
  tenantId: string;
  kind: UploadKind;
  file: File;
}): Promise<
  StoredObject & { width: number | null; height: number | null; isVideo: boolean }
> {
  const { tenantId, kind, file } = params;

  if (!file || file.size === 0) {
    throw new UploadError("No file was received.", "NO_FILE");
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const type = sniffMediaType(bytes);
  if (!type) {
    throw new UploadError(
      "That file isn't an image or video we can use. Try a JPEG, PNG, WebP or MP4.",
      "UNSUPPORTED_TYPE",
    );
  }

  const isVideo = isVideoType(type);

  // Videos get their own, larger cap. Checked after sniffing so the
  // limit matches what the file actually is, not what it claims to be.
  const limit = isVideo ? maxVideoBytes() : maxImageBytes();
  if (file.size > limit) {
    const limitMb = Math.floor(limit / (1024 * 1024));
    throw new UploadError(
      `That ${isVideo ? "video" : "image"} is larger than ${limitMb}MB.`,
      "TOO_LARGE",
    );
  }

  // Only images carry dimensions we can read from a header cheaply; a
  // video's are inside the container and not worth parsing here, since
  // the size cap already bounds the damage.
  const dimensions = isVideo ? null : readDimensions(bytes, type);
  if (dimensions && (dimensions.width > MAX_EDGE_PIXELS || dimensions.height > MAX_EDGE_PIXELS)) {
    throw new UploadError(
      "That image's dimensions are too large. Please resize it first.",
      "TOO_MANY_PIXELS",
    );
  }

  const key = buildKey({ tenantId, kind, type });

  try {
    const stored = await getStorageDriver().put({
      key,
      body: bytes,
      contentType: isVideo
        ? (`video/${type}` as `video/${"mp4" | "webm" | "quicktime"}`)
        : (`image/${type}` as `image/${"jpeg" | "png" | "webp" | "avif"}`),
    });
    return {
      ...stored,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      isVideo,
    };
  } catch (cause) {
    // The underlying ENOSPC/EACCES/S3 message goes to the server log,
    // never to the browser — it would leak paths and bucket names.
    console.error("[storage] failed to store an upload", cause);
    throw new UploadError("We couldn't save that file. Please try again.", "STORAGE_FAILED");
  }
}

/** Every base a stored URL of ours might legitimately start with. */
function publicBases(): string[] {
  return [env.UPLOAD_PUBLIC_BASE, env.S3_PUBLIC_URL, env.S3_ENDPOINT].filter(
    (base): base is string => Boolean(base),
  );
}

/**
 * Whether a URL is one of this tenant's own stored images.
 *
 * The gate for anything that writes an image URL to a row: it rejects
 * another restaurant's file, and it rejects arbitrary external URLs,
 * which would otherwise turn the menu into a way to hotlink or probe
 * hosts from our server.
 */
export function isOwnedImageUrl(url: string, tenantId: string): boolean {
  const key = keyFromUrl(url, publicBases());
  return key !== null && keyBelongsToTenant(key, tenantId);
}

/**
 * Best-effort removal of a stored image, given the URL held in a row.
 *
 * Never throws. A file that outlives its row is swept up later; a
 * failed delete must not roll back the database write that is the
 * actual source of truth.
 */
export async function deleteImageByUrl(url: string, tenantId: string): Promise<void> {
  const key = keyFromUrl(url, publicBases());
  if (!key || !keyBelongsToTenant(key, tenantId)) return;

  try {
    await getStorageDriver().delete(key);
  } catch (cause) {
    console.error("[storage] failed to delete an image", { url, cause });
  }
}
