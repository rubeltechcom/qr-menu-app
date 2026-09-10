"use client";

/**
 * Shrink a photo in the browser, before it is uploaded.
 *
 * A phone camera produces a 4000×3000 image of four to eight megabytes.
 * A menu card renders it at a couple of hundred pixels. Sending the
 * original over a restaurant's wifi takes the better part of a minute
 * and achieves nothing, so it is resized here first — typically a
 * twenty- to thirtyfold reduction, and the difference between an upload
 * that feels instant and one the owner watches a spinner through.
 *
 * Two useful side effects come free with re-encoding through a canvas:
 *
 *   - EXIF is stripped, including the GPS coordinates a phone attaches.
 *     A dish photographed at home would otherwise carry the owner's home
 *     address into a public menu.
 *   - Orientation is baked in. `imageOrientation: "from-image"` applies
 *     the EXIF rotation to the pixels, which is what stops the familiar
 *     sideways-photo bug.
 *
 * It fails open on purpose: any error hands back the original file
 * untouched rather than blocking the upload. The server re-checks the
 * type, the size and the dimensions regardless, so nothing here is a
 * security control — it is purely an optimisation.
 */

export interface DownscaleOptions {
  /** Longest edge of the result, in pixels. */
  maxEdge?: number;
  /** JPEG quality, 0-1. */
  quality?: number;
}

export async function downscaleImage(
  file: File,
  { maxEdge = 1600, quality = 0.82 }: DownscaleOptions = {},
): Promise<Blob> {
  if (typeof window === "undefined") return file;

  try {
    if (typeof createImageBitmap !== "function") return file;

    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    // Already small enough, and already a format the server accepts:
    // re-encoding would only lose quality for no gain.
    if (scale === 1 && file.size < 1_000_000 && file.type !== "image/heic") {
      bitmap.close();
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    // A white ground, so a transparent PNG does not become black once
    // it is flattened into a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    // Keep whichever is smaller: for an already-optimised WebP, the
    // JPEG re-encode can genuinely come out larger.
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}
