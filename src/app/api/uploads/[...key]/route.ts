import type { NextRequest } from "next/server";
import { isSafeKey } from "@/modules/storage/key";
import { getStorageDriver } from "@/modules/storage/registry";
import type { StorageKey } from "@/modules/storage/provider";

/**
 * Serves an uploaded photo from local disk.
 *
 * Only reached under the local driver — with S3 configured, stored URLs
 * point at the bucket and the browser never comes here.
 *
 * Menu photos are public by nature: they render on a storefront anyone
 * with the QR code can open, so there is no access check. What this
 * route does guarantee is that a stored file can only ever be handed
 * back as an inert image: the Content-Type comes from the key's
 * extension, which was itself decided by reading the file's magic bytes
 * at upload time, and the headers below stop a browser treating the
 * response as anything else.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await context.params;
  const key = segments.join("/");

  // Anything that is not a complete, well-formed key is a 404 — never a
  // directory listing, and never a message distinguishing "malformed"
  // from "missing".
  if (!isSafeKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  const driver = getStorageDriver();
  if (driver.id !== "LOCAL") {
    return new Response("Not found", { status: 404 });
  }

  let file;
  try {
    file = await driver.read(key as StorageKey);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const requestedEtag = _request.headers.get("if-none-match");
  if (requestedEtag && requestedEtag === file.etag) {
    return new Response(null, { status: 304, headers: { ETag: file.etag } });
  }

  return new Response(file.stream, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes),
      ETag: file.etag,
      // A key is generated fresh for every upload and never rewritten,
      // so the bytes behind this URL can never change.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Belt and braces against a file that is a valid image *and*
      // something else: never sniff, never treat it as a document, and
      // strip it of any ability to load or run anything if it somehow is.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
