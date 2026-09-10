import Redis from "ioredis";
import { env } from "@/lib/env";

/**
 * A counter that stops the upload endpoint being used as free file
 * hosting, without ever standing between a restaurant and its menu.
 *
 * The endpoint is already behind dashboard authentication, so this is a
 * second line of defence against a compromised or careless account —
 * which is why it FAILS OPEN. If Redis is down, uploads are allowed and
 * a warning is logged: losing the ability to fix a menu mid-service is a
 * far worse outcome than an unmetered hour.
 */

let client: Redis | null = null;
let unavailable = false;

function redis(): Redis | null {
  if (unavailable) return null;
  if (client) return client;

  try {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => (attempt > 3 ? null : Math.min(attempt * 200, 1000)),
    });
    client.on("error", (error) => {
      if (!unavailable) {
        unavailable = true;
        console.warn(
          `[uploads] Redis unavailable (${error.message}). Upload rate limiting is off; ` +
            `authentication still applies.`,
        );
      }
    });
    return client;
  } catch {
    unavailable = true;
    return null;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window rolls over. Only meaningful when denied. */
  retryAfter: number;
}

const ALLOWED: RateLimitResult = { allowed: true, retryAfter: 0 };

/**
 * Two windows, both of which must pass: a burst limit that catches a
 * runaway script, and an hourly limit that caps sustained abuse.
 */
const LIMITS = [
  { suffix: "m", windowSeconds: 60, max: 30 },
  { suffix: "h", windowSeconds: 3600, max: 300 },
] as const;

export async function checkUploadRateLimit(tenantId: string): Promise<RateLimitResult> {
  const connection = redis();
  if (!connection) return ALLOWED;

  try {
    for (const limit of LIMITS) {
      const bucket = Math.floor(Date.now() / 1000 / limit.windowSeconds);
      const key = `uploads:${tenantId}:${limit.suffix}:${bucket}`;

      const count = await connection.incr(key);
      // Set the expiry only when the counter is created, so a long run
      // of uploads cannot keep pushing the window out.
      if (count === 1) await connection.expire(key, limit.windowSeconds);

      if (count > limit.max) {
        const elapsed = Math.floor(Date.now() / 1000) % limit.windowSeconds;
        return { allowed: false, retryAfter: limit.windowSeconds - elapsed };
      }
    }
    return ALLOWED;
  } catch (error) {
    console.warn("[uploads] rate limit check failed; allowing the upload", error);
    return ALLOWED;
  }
}
