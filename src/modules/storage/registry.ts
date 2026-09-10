import path from "node:path";
import { env } from "@/lib/env";
import { localDriver, uploadRoot } from "./local.driver";
import { s3Driver } from "./s3.driver";
import type { StorageDriver } from "./provider";

/**
 * The one place that knows which storage drivers exist.
 *
 * S3 wins when it is configured, local disk otherwise. Nothing else in
 * the app branches on storage: a restaurant can start on a single box
 * and move to object storage by setting environment variables, and the
 * URLs already written to the database keep working either way.
 */

let cached: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  cached ??= s3Driver.isConfigured() ? s3Driver : localDriver;
  return cached;
}

/** For diagnostics. Never reveals credentials or a full server path. */
export function describeStorage(): {
  id: StorageDriver["id"];
  displayName: string;
  detail: string;
} {
  const driver = getStorageDriver();
  return {
    id: driver.id,
    displayName: driver.displayName,
    detail: driver.id === "S3" ? (env.S3_BUCKET ?? "") : path.basename(uploadRoot()),
  };
}

/**
 * Boot preflight, called from src/instrumentation.ts.
 *
 * A storage backend that cannot be written to is a deployment mistake,
 * and the only good time to find out is at startup — not when a
 * restaurant uploads its first dish photo.
 */
export async function assertStorageWritable(): Promise<void> {
  const driver = getStorageDriver();
  await driver.assertWritable();

  // The classic Docker mistake: UPLOAD_DIR left at its default, so it
  // resolves inside the deployed application directory instead of a
  // mounted volume. Everything works until the next redeploy silently
  // takes every photo with it, so it is worth saying out loud.
  if (driver.id === "LOCAL" && env.NODE_ENV === "production") {
    const root = uploadRoot();
    if (root.startsWith(path.resolve(process.cwd()) + path.sep)) {
      console.warn(
        `[storage] WARNING: UPLOAD_DIR (${root}) is inside the application ` +
          `directory. If this is a container, it is almost certainly NOT a ` +
          `persistent volume, and every uploaded photo will be lost on the ` +
          `next redeploy. Mount a volume and set UPLOAD_DIR to it.`,
      );
    }
  }
}
