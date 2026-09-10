import { EventEmitter } from "node:events";
import Redis from "ioredis";
import { env } from "@/lib/env";

/**
 * The realtime fan-out behind the order board's SSE streams.
 *
 * PROMPT.md §5.3 calls for Redis pub/sub so that every app instance
 * delivers, which is right in production: an order placed on instance A
 * must wake the kitchen tab held open against instance B.
 *
 * But a kitchen that stops hearing orders is this product's one
 * unrecoverable failure — staff don't find out until a diner complains.
 * So Redis is treated as an optimisation, not a dependency: if it is
 * unreachable, the bus degrades to in-process delivery and the app keeps
 * working (correctly on a single instance, and with a loud warning). A
 * hard dependency here would mean a Redis blip takes the restaurant down.
 */

export interface RealtimeMessage {
  /** Monotonic per channel, so a reconnecting client can spot a gap. */
  seq: number;
  /** Event name the browser's EventSource listens for. */
  event: string;
  /** JSON-serialisable payload. */
  data: unknown;
}

type Listener = (message: RealtimeMessage) => void;

/** Channel names — one per location, per PROMPT.md §5.3. */
export const channels = {
  locationOrders: (tenantId: string, locationId: string) =>
    `tenant:${tenantId}:location:${locationId}:orders`,
  /** A single diner following their own order. */
  orderTrack: (trackToken: string) => `order:${trackToken}`,
};

const local = new EventEmitter();
// A kitchen tab, a waiter tablet and a tracking page can all watch the
// same channel; the default cap of 10 is easily passed on a busy shift.
local.setMaxListeners(0);

/**
 * Sequence numbers are per-channel and per-process. They exist so a
 * client can detect that it missed something and re-sync — not to order
 * events globally, which would need Redis INCR and buy nothing here,
 * since the resync path re-reads from the database anyway.
 */
const sequences = new Map<string, number>();

function nextSeq(channel: string): number {
  const seq = (sequences.get(channel) ?? 0) + 1;
  sequences.set(channel, seq);
  return seq;
}

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let redisUnavailable = false;

function createRedis(role: "publisher" | "subscriber"): Redis | null {
  if (redisUnavailable) return null;
  try {
    const client = new Redis(env.REDIS_URL, {
      // Fail fast and stay quiet rather than filling the log with retry
      // noise on a dev machine with no Redis running.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 200, 2000)),
      lazyConnect: false,
    });

    client.on("error", (error) => {
      if (!redisUnavailable) {
        redisUnavailable = true;
        console.warn(
          `[realtime] Redis ${role} unavailable (${error.message}). ` +
            `Falling back to in-process delivery — correct on a single instance, ` +
            `but orders will NOT reach other instances until Redis is back.`,
        );
      }
    });

    return client;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

function getPublisher(): Redis | null {
  publisher ??= createRedis("publisher");
  return publisher;
}

function getSubscriber(): Redis | null {
  if (subscriber) return subscriber;
  const client = createRedis("subscriber");
  if (!client) return null;

  client.on("message", (channel, raw) => {
    try {
      const message = JSON.parse(raw) as RealtimeMessage;
      local.emit(channel, message);
    } catch {
      // A malformed payload must not kill the subscriber — the next
      // message should still get through.
      console.warn(`[realtime] Dropped unparseable message on ${channel}`);
    }
  });

  subscriber = client;
  return client;
}

/**
 * Publish to a channel. Delivers in-process immediately (so the local
 * instance never depends on a Redis round-trip) and to Redis for other
 * instances, de-duplicated by the publisher tag on the payload.
 */
export async function publish(channel: string, event: string, data: unknown): Promise<void> {
  const message: RealtimeMessage = { seq: nextSeq(channel), event, data };

  // Local first: this is the path that must never fail.
  local.emit(channel, message);

  const redis = getPublisher();
  if (!redis || redisUnavailable) return;

  try {
    await redis.publish(channel, JSON.stringify({ ...message, origin: processId }));
  } catch {
    // Already logged by the error handler; local delivery has happened.
  }
}

/** Identifies this process so it can ignore its own Redis echo. */
const processId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Subscribe to a channel. Returns an unsubscribe function — always call
 * it when the SSE connection closes, or listeners accumulate for the
 * life of the process.
 */
export function subscribe(channel: string, listener: Listener): () => void {
  const wrapped = (message: RealtimeMessage & { origin?: string }) => {
    // Skip the Redis echo of a message this process already delivered
    // locally, or the board would show every order twice.
    if (message.origin === processId) return;
    listener(message);
  };

  local.on(channel, wrapped);

  const redis = getSubscriber();
  if (redis && !redisUnavailable) {
    redis.subscribe(channel).catch(() => {
      // Error handler has already warned; in-process delivery continues.
    });
  }

  return () => {
    local.off(channel, wrapped);
    if (local.listenerCount(channel) === 0 && subscriber && !redisUnavailable) {
      subscriber.unsubscribe(channel).catch(() => {});
    }
  };
}
