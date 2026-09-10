-- Lets a signed-in person discover which tenants they belong to.
--
-- The bug this fixes: "memberships" and "tenants" both carried only the
-- tenant_isolation policy, which requires app.tenant_id to already be
-- set. But a membership lookup is what ESTABLISHES the tenant — the
-- dashboard asks "which restaurants does this user belong to?" before any
-- tenant is chosen, and requireDashboardTenant() resolves the tenant from
-- the membership. With only the scoped policy in place that read matched
-- zero rows, so an owner saw "No restaurants yet" and every
-- /dashboard/<slug>/* route 404'd, while the row sat in the table.
--
-- The note at the bottom of 20260909183100_row_level_security already
-- described the intent ("users ... is scoped by membership lookups in
-- application code") — this migration makes that actually possible.
--
-- Both policies below are deliberately narrow: SELECT only, and only
-- while app.tenant_id is unset — exactly the pre-tenant bootstrap window.
-- Once a tenant is selected, tenant_isolation governs as before. Postgres
-- ORs permissive policies together, so this widens reads only for that
-- one case, and never for writes.

CREATE POLICY bootstrap_owner_lookup ON "memberships"
  FOR SELECT
  USING (coalesce(current_setting('app.tenant_id', true), '') = '');

-- The membership join needs its tenant row, or Prisma fails the query
-- with "Field tenant is required to return data, got null". Unlike the
-- policy above, this one is NOT a blanket read: a tenant is visible
-- during bootstrap only if a membership points at it. That still exposes
-- every tenant to any authenticated database session, so the per-user
-- narrowing stays application code's job — membership.repository.ts
-- filters by the caller's own userId, the same arrangement already used
-- for the global "users" table.
--
-- Tightening this to the requesting user would mean carrying a
-- current_setting('app.user_id') GUC through every request; worth doing
-- when the superadmin surface lands and there is a second reader of
-- these tables, but it buys nothing while the only caller already
-- filters by userId.
CREATE POLICY bootstrap_tenant_lookup ON "tenants"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND EXISTS (
      SELECT 1 FROM "memberships" m WHERE m."tenantId" = "tenants".id
    )
  );
