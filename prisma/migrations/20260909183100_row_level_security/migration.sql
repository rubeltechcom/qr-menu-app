-- Row-Level Security — database-layer tenant isolation.
--
-- This is one of three independent isolation layers required by
-- PROMPT.md §3.1 (the other two are the Prisma tenant-scoping extension
-- in src/server/db/tenant-client.ts and the AsyncLocalStorage request
-- context in src/server/tenant-context.ts). Even if application code has
-- a bug that forgets to scope a query, these policies stop a cross-tenant
-- read or write at the database itself.
--
-- Policies read the `app.tenant_id` session setting, which
-- forTenant()/tenant-client.ts sets on every query via
-- set_config('app.tenant_id', $tenantId, true).
--
-- IMPORTANT: the application's database role must NOT be a superuser and
-- must NOT have BYPASSRLS — both would silently disable every policy
-- below. The dedicated "qrmenu" role created for this project has
-- neither by default; do not grant BYPASSRLS to it.

-- ---------------------------------------------------------------------
-- tenants — a tenant may only see its own row (scoped by id, not tenantId)
-- ---------------------------------------------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tenants"
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "memberships"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------
-- domains
-- ---------------------------------------------------------------------
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "domains" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "domains"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "locations"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------
-- users / staff_pins / audit_logs are intentionally NOT tenant-scoped
-- here:
--   - "users" is a global identity table (a person can belong to
--     multiple tenants via "memberships"); it is scoped by membership
--     lookups in application code, not by a tenantId column.
--   - "staff_pins" is reached only via its owning membership, which is
--     already tenant-scoped.
--   - "audit_logs" is intentionally readable across tenants only by the
--     platform superadmin role (a separate, non-RLS-bypassing path to be
--     added when the superadmin surface is built) and is written with a
--     nullable tenantId for platform-level events.
-- ---------------------------------------------------------------------
