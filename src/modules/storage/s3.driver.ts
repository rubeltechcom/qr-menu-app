import type { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { isSafeKey } from "./key";
import type {
  ListedObject,
  PutParams,
  ReadResult,
  StorageDriver,
  StorageKey,
} from "./provider";

/**
 * Files in an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).
 *
 * Opt-in: this driver activates only when a bucket and credentials are
 * present in the environment, and the local driver serves everyone else.
 * It exists for installs that outgrow a single server — several app
 * containers behind a load balancer cannot share a local volume — or
 * that want a CDN in front of dish photos.
 *
 * The SDK is imported lazily so an install that never configures S3
 * never pays to load it.
 */

type Sdk = typeof import("@aws-sdk/client-s3");

let cached: Promise<{ sdk: Sdk; client: S3Client }> | null = null;

async function connection() {
  cached ??= (async () => {
    const sdk = await import("@aws-sdk/client-s3");

    const client = new sdk.S3Client({
      // Unset for real AWS; set for R2 and MinIO.
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      region: process.env.AWS_REGION ?? "auto",
      // Path-style addressing keeps MinIO and self-hosted gateways
      // working, where virtual-host style would need DNS per bucket.
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });

    return { sdk, client };
  })();

  return cached;
}

function bucket(): string {
  const name = env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not set");
  return name;
}

export const s3Driver: StorageDriver = {
  id: "S3",
  displayName: "S3-compatible storage",

  isConfigured: () =>
    Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),

  async put({ key, body, contentType }: PutParams) {
    if (!isSafeKey(key)) throw new Error("Refusing to store an unsafe storage key");

    const { sdk, client } = await connection();
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are unique per upload and never rewritten, so the bytes
        // behind a URL never change and may be cached indefinitely.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { key, url: this.publicUrl(key), bytes: body.byteLength };
  },

  async delete(key: StorageKey) {
    const { sdk, client } = await connection();
    // S3 reports deleting a missing object as success, which is the
    // behaviour the orphan sweeper relies on.
    await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },

  async exists(key: StorageKey) {
    const { sdk, client } = await connection();
    try {
      await client.send(new sdk.HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return true;
    } catch {
      return false;
    }
  },

  publicUrl(key: StorageKey) {
    if (env.S3_PUBLIC_URL) {
      return `${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;
    }
    if (env.S3_ENDPOINT) {
      return `${env.S3_ENDPOINT.replace(/\/+$/, "")}/${bucket()}/${key}`;
    }
    return `https://${bucket()}.s3.amazonaws.com/${key}`;
  },

  read(): Promise<ReadResult> {
    // Under S3 the stored URL is absolute and the browser fetches the
    // object directly, so nothing should ever ask us to serve the bytes.
    return Promise.reject(
      new Error("The S3 driver serves objects by URL; it does not stream them"),
    );
  },

  async *list(prefix: string): AsyncIterable<ListedObject> {
    const { sdk, client } = await connection();
    let token: string | undefined;

    do {
      const page = await client.send(
        new sdk.ListObjectsV2Command({
          Bucket: bucket(),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );

      for (const object of page.Contents ?? []) {
        if (!object.Key || !isSafeKey(object.Key)) continue;
        yield {
          key: object.Key as StorageKey,
          bytes: object.Size ?? 0,
          modifiedAt: object.LastModified ?? new Date(0),
        };
      }

      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  },

  async assertWritable() {
    const { sdk, client } = await connection();
    try {
      await client.send(new sdk.ListObjectsV2Command({ Bucket: bucket(), MaxKeys: 1 }));
    } catch (cause) {
      throw new Error(
        `Cannot reach the S3 bucket "${bucket()}". Check S3_ENDPOINT, ` +
          `S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.`,
        { cause },
      );
    }
  },
};
