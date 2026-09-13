import { NextResponse, type NextRequest } from "next/server";

/**
 * Tenant resolution — runs before any route handler.
 *
 * Resolution order (PROMPT.md §3.2):
 *   1. Custom domain exact match (looked up from the Domain table, cached)
 *   2. Platform subdomain (<slug>.<APP_DOMAIN>)
 *   3. Reserved subdomains resolve to platform surfaces, never a tenant
 *
 * This file only extracts a candidate slug/hostname and attaches it to
 * request headers for the route/layout to resolve against the database —
 * the proxy itself must stay edge-safe and cannot depend on Prisma.
 * The actual forTenant()/runWithTenant() wiring happens in the root
 * layout or a dedicated resolver called from route handlers, using the
 * `x-tenant-hostname` header set here.
 *
 * Named proxy.ts per the Next.js 16 convention (formerly middleware.ts).
 */

/**
 * Slugs a tenant may never claim.
 *
 * Two separate hazards, one list, because a slug has to survive both
 * shapes a storefront link can take:
 *
 *   * As a subdomain (<slug>.<APP_DOMAIN>), `www` or `mail` would
 *     shadow infrastructure that has nothing to do with this app.
 *
 *   * As a path segment — the shape every install uses when APP_DOMAIN
 *     is unset, and the one a shop link is built from — a slug that
 *     matches a top-level route would shadow the route itself. A tenant
 *     called `dashboard` is not a cosmetic clash: it is someone else's
 *     slug sitting where the operator's own console is served from.
 *
 * So every segment under src/app/ belongs here, not just DNS names.
 * reserved-slugs.test.ts reads that directory and fails if a route is
 * added without a matching entry, because the failure mode otherwise is
 * silent and only appears once a tenant happens to pick the name.
 */
export const RESERVED_SLUGS = new Set([
  // Infrastructure hostnames, meaningful only as subdomains.
  "www",
  "app",
  "cdn",
  "static",
  "mail",
  "blog",
  "help",
  "status",

  // Top-level routes — see src/app/. Keep in sync; the test enforces it.
  "admin",
  "api",
  "dashboard",
  "login",
  "logout",
  "m",
  "offline",
  "order",
  "signup",
  "staff",
  "t",

  // Well-known files Next.js serves from the root. These are not
  // directories under src/app/, so the test cannot derive them.
  "_next",
  "favicon.ico",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
]);

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-hostname", hostname.split(":")[0] ?? "");

  // A layout does not receive its child route's params, so the path is
  // carried in a header instead — the dashboard's navigation needs to
  // know which restaurant is open in order to link to its sections.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next.js internals.
    // api/uploads is excluded too: it serves cached dish photos, and
    // resolving a tenant for every image on a menu is pure overhead.
    "/((?!_next/static|_next/image|api/uploads|favicon.ico).*)",
  ],
};
