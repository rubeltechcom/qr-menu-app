import { rawPrisma } from "@/server/db/client";

/**
 * The one read a shop's own storefront link needs, before any tenant is
 * known.
 *
 * A shopper arrives at /<slug> with no account and no tenant selected —
 * the slug in the URL is the only thing the request carries, and
 * resolving it is what establishes which shop this is. That satisfies
 * none of the ordinary SELECT policies on "tenants": tenant_isolation
 * wants the tenant id we are trying to find, bootstrap_tenant_lookup
 * wants a signed-in user, and a shopper is neither.
 *
 * The `storefront_slug_lookup` policy (migration 20260913060000) opens a
 * deliberately narrow window for exactly this, gated on GUCs that are
 * set here, transaction-scoped, and set nowhere else. This file exists
 * so that window has one obvious place to open and close — the same
 * arrangement staff-login.repository.ts uses for PIN sign-in.
 *
 * Resolving a slug grants nothing on its own: the slug is public by
 * construction, since it is the address the shop hands out. Everything
 * after this runs through forTenant(tenantId) under tenant_isolation.
 */

type TxClient = Parameters<Parameters<typeof rawPrisma.$transaction>[0]>[0];

/**
 * Runs `fn` inside the storefront-lookup window, which admits exactly
 * one shop: the one `slug` names.
 *
 * The slug goes into a GUC of its own because the policy matches on it.
 * A window gated only on a boolean would let any query inside it read
 * every tenant row — the WHERE clause below would be the only thing
 * stopping enumeration, and application code is not where an isolation
 * boundary belongs. Passing the slug to the database means the policy
 * enforces "this shop and no other" itself.
 *
 * `true` on set_config makes both settings transaction-scoped, so they
 * cannot leak to the next borrower of a pooled connection.
 */
function duringStorefrontLookup<T>(slug: string, fn: (tx: TxClient) => Promise<T>) {
  return rawPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('app.storefront_lookup', 'on', true)`);
    await tx.$executeRawUnsafe(`select set_config('app.storefront_slug', $1, true)`, slug);
    return fn(tx as TxClient);
  });
}

export interface StorefrontTenant {
  id: string;
  slug: string;
  name: string;
}

/**
 * The shop behind a slug, or null if there is no such shop.
 *
 * Null rather than a thrown error, and the caller renders a 404 without
 * distinguishing "no such shop" from "that shop closed" — the same
 * reasoning as resolveTableByPublicCode(): a message that told them
 * apart would let someone enumerate which slugs exist.
 */
export function resolveTenantBySlug(slug: string): Promise<StorefrontTenant | null> {
  return duringStorefrontLookup(slug, (tx) =>
    tx.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, slug: true, name: true },
    }),
  );
}
