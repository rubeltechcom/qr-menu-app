-- Fixes tenant creation under FORCE ROW LEVEL SECURITY.
--
-- Problem: "tenants" has FORCE ROW LEVEL SECURITY with a WITH CHECK
-- clause requiring id = current_setting('app.tenant_id'). Creating a
-- brand-new tenant (signup) has no tenant context yet, so the INSERT
-- was rejected outright.
--
-- Fix: application code (see src/modules/tenants/tenant.service.ts)
-- generates the new tenant's id client-side and calls
-- set_config('app.tenant_id', <that same id>, true) immediately before
-- the INSERT, so the WITH CHECK passes naturally — id equals the tenant
-- context because they are, by construction, the same value. No policy
-- change is required; this migration documents the pattern and adds a
-- comment on the table so it isn't rediscovered as a "bug" later.
COMMENT ON TABLE "tenants" IS
  'RLS: creating a tenant requires set_config(''app.tenant_id'', <new id>, true) '
  'BEFORE the insert, using a client-generated id. See tenant.service.ts createTenant().';
