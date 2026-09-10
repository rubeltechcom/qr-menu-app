/**
 * Sequential order numbers, per location, per business day.
 *
 * Staff call orders out loud ("order 14 ready"), so the number has to be
 * short and human — not a cuid. It restarts each service day rather than
 * growing forever, which is why the counter is keyed by business date.
 *
 * Two orders placed in the same instant must never share a number, so
 * allocation goes through a dedicated counter row taken with
 * `SELECT ... FOR UPDATE`. That serialises concurrent allocations on the
 * row rather than relying on a read-then-write, which races.
 */
/**
 * Only the raw-SQL surface is needed here, and typing it that way keeps
 * this usable from both the plain Prisma client and the extended,
 * tenant-scoped one — whose transaction client is a structurally
 * different (and much noisier) type.
 */
interface RawSqlClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * The calendar day an order belongs to, in the location's own timezone,
 * as YYYY-MM-DD.
 *
 * Timezone matters here: an order placed at 00:30 in Dhaka belongs to
 * that day's service in Dhaka, not to whatever day it is in UTC. Using
 * the server's clock would silently split one night's numbering across
 * two dates for any restaurant not on UTC.
 */
export function businessDateFor(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An invalid timezone on a Location shouldn't stop a diner ordering.
    // Fall back to UTC and keep going — a wrong-day number is a nuisance,
    // a failed order is lost revenue.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

/**
 * Allocate the next order number for a location on a business date.
 *
 * MUST be called inside a transaction — the row lock only holds for the
 * life of the surrounding transaction, and releasing it before the order
 * row is written would let a crash burn a number or, worse, let a second
 * caller take the same one.
 */
export async function allocateOrderNumber(
  tx: RawSqlClient,
  params: { tenantId: string; locationId: string; businessDate: string },
): Promise<number> {
  const { tenantId, locationId, businessDate } = params;

  // The tenant-scoping Prisma extension intercepts model queries, not
  // raw SQL, so `app.tenant_id` is NOT set on this connection — every
  // statement below would be refused by RLS. Set it explicitly for the
  // life of this transaction (the `true` makes it transaction-local, so
  // it cannot leak to the next borrower of a pooled connection).
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  // Upsert-then-lock rather than lock-then-upsert: the row may not exist
  // yet on the first order of the day, and two first-orders racing would
  // both find nothing to lock. ON CONFLICT DO NOTHING makes the create
  // safe to lose, then the lock below serialises the actual increment.
  await tx.$executeRaw`
    INSERT INTO "order_counters" ("id", "tenantId", "locationId", "businessDate", "nextNumber")
    VALUES (gen_random_uuid()::text, ${tenantId}, ${locationId}, ${businessDate}, 1)
    ON CONFLICT ("locationId", "businessDate") DO NOTHING
  `;

  const rows = await tx.$queryRaw<Array<{ nextNumber: number }>>`
    SELECT "nextNumber" FROM "order_counters"
    WHERE "locationId" = ${locationId} AND "businessDate" = ${businessDate}
    FOR UPDATE
  `;

  const current = rows[0]?.nextNumber;
  if (current === undefined) {
    // The insert above guarantees a row exists; if it is missing here,
    // RLS filtered it out — which means the tenant context is wrong and
    // continuing would allocate against another tenant's counter.
    throw new Error(
      `Order counter missing for location ${locationId} on ${businessDate} — tenant context may not be set.`,
    );
  }

  await tx.$executeRaw`
    UPDATE "order_counters" SET "nextNumber" = ${current + 1}
    WHERE "locationId" = ${locationId} AND "businessDate" = ${businessDate}
  `;

  return current;
}
