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

// Keep this list in one place and validate signups against it too, so a
// restaurant can never claim a slug that would shadow a platform surface.
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "cdn",
  "static",
  "mail",
  "blog",
  "help",
  "status",
]);

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-hostname", hostname.split(":")[0] ?? "");

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next.js internals.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
