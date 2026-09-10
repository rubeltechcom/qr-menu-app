-- Row-Level Security for Phase 3 storefront tables — same pattern
-- established in 20260909183100_row_level_security. See that migration
-- for the full rationale.

ALTER TABLE "zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zones" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "zones"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tables"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- The storefront resolves a table from its publicCode BEFORE any tenant
-- is known — the QR URL (/t/<publicCode>) carries no tenant, and the
-- table is what tells us which tenant the diner is ordering from. That
-- lookup therefore cannot run under a tenant policy, so it is given its
-- own narrow read policy instead of being allowed to bypass RLS.
--
-- This policy is deliberately limited to what the QR entry point needs:
-- it applies only when app.tenant_id is unset (an unscoped storefront
-- request), and only to tables that are active and not soft-deleted.
-- Once resolved, every subsequent query runs through forTenant() under
-- the tenant_isolation policy above.
CREATE POLICY public_code_lookup ON "tables"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND "isActive"
    AND "deletedAt" IS NULL
  );
