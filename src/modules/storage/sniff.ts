import type { ImageType, MediaType, VideoType } from "./provider";

/**
 * What a file actually is, decided from its first bytes.
 *
 * The browser sends a Content-Type and a filename with every upload.
 * Both are attacker-controlled and neither is consulted anywhere in this
 * codebase: a file named `menu.jpg`, declared `image/jpeg`, containing
 * HTML with a <script> tag is a real and well-known attack, and the only
 * defence that works is reading the bytes.
 *
 * SVG is deliberately unsupported. It is a document format that can
 * carry script, and there is no way to serve one inline from our own
 * origin without handing it the origin's privileges.
 */

/** How many leading bytes any check below needs. */
const HEADER_BYTES = 32;

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;

  // JPEG: SOI marker.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  // PNG: 8-byte signature.
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" .... "WEBP".
  if (
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // AVIF: an ISO-BMFF box whose major brand is avif/avis.
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }

  return null;
}

/**
 * Video formats, decided the same way and for the same reason: a phone
 * will happily label a file `video/mp4` when it is nothing of the sort.
 *
 * MP4 and QuickTime share the ISO base media container, distinguished
 * by their brand. QuickTime is included because that is what an iPhone
 * produces, and rejecting it would mean rejecting most uploads.
 */
export function sniffVideoType(bytes: Uint8Array): VideoType | null {
  if (bytes.length < 12) return null;

  // WebM/Matroska: EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm";
  }

  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "qt  ") return "quicktime";
    // isom, iso2, mp41, mp42, avc1, M4V, dash… all play as MP4.
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash|mmp4)$/.test(brand)) return "mp4";
  }

  return null;
}

/** Either kind, for an endpoint that accepts both. */
export function sniffMediaType(bytes: Uint8Array): MediaType | null {
  return sniffImageType(bytes) ?? sniffVideoType(bytes);
}

export function isVideoType(type: MediaType): type is VideoType {
  return type === "mp4" || type === "webm" || type === "quicktime";
}

/**
 * Width and height read from the header alone, or null if they cannot be
 * determined.
 *
 * The point is to reject a decompression bomb — a 100×100 file that
 * declares 60000×60000 — *without* decoding it. We never decode an
 * uploaded image on the server at all, which removes the entire class of
 * image-parsing vulnerabilities that comes with a native decoder.
 *
 * Returning null is not a failure: AVIF dimensions live deep in the box
 * structure and are not worth parsing here. The caller treats unknown
 * dimensions as acceptable, because the byte-size cap still applies.
 */
export function readDimensions(
  bytes: Uint8Array,
  type: ImageType,
): { width: number; height: number } | null {
  try {
    switch (type) {
      case "png":
        return readPngDimensions(bytes);
      case "jpeg":
        return readJpegDimensions(bytes);
      case "webp":
        return readWebpDimensions(bytes);
      case "avif":
        return null;
    }
  } catch {
    // A truncated or malformed header is not our problem to diagnose —
    // the type check already passed, and the size cap still holds.
    return null;
  }
}

function readPngDimensions(bytes: Uint8Array) {
  // IHDR is always the first chunk: 8-byte signature, 4-byte length,
  // 4-byte type, then width and height as big-endian uint32.
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpegDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2; // past SOI

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // resync over padding
      continue;
    }
    const marker = bytes[offset + 1]!;

    // SOFn carries the frame size. C4/C8/CC are not frame headers.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan — pixel data follows, so the header is over.
    if (marker === 0xda) return null;

    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array) {
  const format = ascii(bytes, 12, 16);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Simple lossy: 'VP8 ' — dimensions are 14 bytes into the chunk.
  if (format === "VP8 " && bytes.length >= 30) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  // Lossless: 'VP8L' — 14 bits each, packed after the 0x2f signature.
  if (format === "VP8L" && bytes.length >= 25) {
    const packed = view.getUint32(21, true);
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    };
  }
  // Extended: 'VP8X' — 24-bit little-endian, stored as value - 1.
  if (format === "VP8X" && bytes.length >= 30) {
    const width = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
    const height = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;
    return { width, height };
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

export { HEADER_BYTES };
