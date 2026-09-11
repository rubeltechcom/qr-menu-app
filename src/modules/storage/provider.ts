/**
 * The storage driver contract.
 *
 * Two implementations exist — local disk and S3 — and the rest of the app
 * never knows which one it is talking to. That is what lets a restaurant
 * run on a single Coolify box with a mounted volume today and move to
 * object storage later by setting environment variables, with no code
 * change and no migration of the URLs already in the database.
 *
 * Mirrors the shape of src/modules/payments/provider.ts: an interface
 * here, one file per driver, and a registry that picks between them.
 */

/** Image formats we accept. SVG is deliberately absent — see sniff.ts. */
export type ImageType = "jpeg" | "png" | "webp" | "avif";

/** Video formats. MP4 first: it is the only one every phone plays. */
export type VideoType = "mp4" | "webm" | "quicktime";

export type MediaType = ImageType | VideoType;

export type StorageDriverId = "LOCAL" | "S3";

/**
 * The driver-agnostic identity of a stored file.
 *
 * Shape: `t/<tenantId>/<kind>/<yyyy>/<mm>/<cuid2>.<ext>`
 *
 * Always POSIX separators, even on Windows — a key is a portable
 * identifier, not a path, and is only turned into a platform path at the
 * filesystem boundary inside local.driver.ts.
 *
 * Branded so a raw string cannot be passed where a validated key is
 * expected: the only ways to obtain one are buildKey() and parseKey(),
 * both of which enforce the shape above.
 */
export type StorageKey = string & { readonly __brand: "StorageKey" };

/**
 * What a file is attached to. Part of the key, so it is also a folder.
 * `brand` covers a restaurant's own logo.
 */
export type UploadKind = "menuItem" | "category" | "brand";

export interface PutParams {
  key: StorageKey;
  body: Buffer;
  /**
   * Determined by the server from the file's magic bytes — never taken
   * from the client's Content-Type header, which is a claim, not a fact.
   */
  contentType: `image/${ImageType}` | `video/${VideoType}`;
}

export interface StoredObject {
  key: StorageKey;
  /**
   * What gets written to MenuItem.images / Category.imageUrl: a
   * same-origin path under the local driver, an absolute URL under S3.
   */
  url: string;
  bytes: number;
}

export interface ReadResult {
  stream: ReadableStream<Uint8Array>;
  bytes: number;
  contentType: string;
  etag: string;
}

export interface ListedObject {
  key: StorageKey;
  bytes: number;
  modifiedAt: Date;
}

export interface StorageDriver {
  readonly id: StorageDriverId;
  readonly displayName: string;

  /** False when this driver's configuration is absent or incomplete. */
  isConfigured(): boolean;

  /** Writes a file. Atomic where the backend allows it. */
  put(params: PutParams): Promise<StoredObject>;

  /**
   * Removes a file. Must NOT throw when the object is already gone —
   * deletion is retried and swept, so it has to be safe to repeat.
   */
  delete(key: StorageKey): Promise<void>;

  exists(key: StorageKey): Promise<boolean>;

  /** Synchronous and pure: this is called from render paths. */
  publicUrl(key: StorageKey): string;

  /**
   * Bytes for serving over HTTP. Local only — under S3 the browser
   * fetches the object's own URL directly and never reaches our server,
   * so the S3 driver throws here.
   */
  read(key: StorageKey): Promise<ReadResult>;

  /** Enumerates stored keys. Used only by the orphan sweeper. */
  list(prefix: string): AsyncIterable<ListedObject>;

  /**
   * Boot preflight. Throws with a message naming the fix if the backing
   * store is unusable, so a misconfigured deploy fails at startup rather
   * than when a restaurant uploads its first photo.
   */
  assertWritable(): Promise<void>;
}
