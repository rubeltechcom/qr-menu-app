import { AsyncLocalStorage } from "node:async_hooks";
import { forTenant, type TenantPrismaClient } from "./db/tenant-client";

/**
 * Tenant isolation — request layer.
 *
 * Middleware resolves the tenant from the request hostname (see
 * middleware.ts) before any route handler runs, and calls
 * runWithTenant() to populate this store. A request that never resolves
 * a tenant simply has no context here — route handlers for tenant-scoped
 * surfaces must call requireTenantContext() and treat a missing context
 * as a 404, never fall back to an unscoped query.
 */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  db: TenantPrismaClient;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(
  tenantId: string,
  tenantSlug: string,
  fn: () => T,
): T {
  const context: TenantContext = {
    tenantId,
    tenantSlug,
    db: forTenant(tenantId),
  };
  return storage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/**
 * Use this in every tenant-scoped route handler / server action. Throwing
 * here (rather than silently returning undefined) means a developer
 * cannot accidentally ship a handler that queries without tenant scope.
 */
export function requireTenantContext(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      "No tenant context available. This handler must only be reached via a request that resolved a tenant in middleware.",
    );
  }
  return context;
}
