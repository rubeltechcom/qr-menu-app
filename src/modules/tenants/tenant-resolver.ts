import { headers } from "next/headers";
import { rawPrisma } from "@/server/db/client";
import { env } from "@/lib/env";
import { RESERVED_SUBDOMAINS } from "@/proxy";

/**
 * Resolves the current request's tenant from the `x-tenant-hostname`
 * header set by proxy.ts, per PROMPT.md §3.2:
 *   1. Custom domain exact match
 *   2. Platform subdomain (<slug>.<APP_DOMAIN>)
 *   3. Reserved subdomains never resolve to a tenant
 *
 * This does a raw lookup (not forTenant()) because resolving *which*
 * tenant a request belongs to necessarily happens before that tenant's
 * id is known — there is nothing to scope to yet. The result is a
 * minimal, non-sensitive projection (id + slug), not general tenant
 * data access.
 */
export async function resolveTenantFromRequest(): Promise<{
  id: string;
  slug: string;
} | null> {
  const hostname = (await headers()).get("x-tenant-hostname");
  if (!hostname) return null;

  // 1. Custom domain exact match.
  const domain = await rawPrisma.domain.findUnique({
    where: { hostname, status: "ACTIVE" },
    select: { tenant: { select: { id: true, slug: true } } },
  });
  if (domain) return domain.tenant;

  // 2. Platform subdomain — only where the install actually uses them.
  // Unset means every restaurant is served from one hostname under
  // /m/<slug>/t/<code>, so there is no subdomain to read here.
  const rootDomain = env.APP_DOMAIN;
  if (!rootDomain) return null;
  if (hostname === rootDomain || !hostname.endsWith(`.${rootDomain}`)) {
    return null;
  }
  const candidateSlug = hostname.slice(0, -(rootDomain.length + 1));
  if (
    !candidateSlug ||
    candidateSlug.includes(".") ||
    RESERVED_SUBDOMAINS.has(candidateSlug)
  ) {
    return null;
  }

  const tenant = await rawPrisma.tenant.findUnique({
    where: { slug: candidateSlug },
    select: { id: true, slug: true },
  });
  return tenant;
}
