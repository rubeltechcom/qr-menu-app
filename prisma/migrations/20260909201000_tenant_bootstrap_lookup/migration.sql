-- Completes the bootstrap lookup started in
-- 20260909200000_membership_owner_lookup.
--
-- That migration let a signed-in person read their own memberships before
-- a tenant is chosen. But the dashboard needs each membership's tenant
-- (name, slug, plan) to render the list, and "tenants" was still locked
-- behind tenant_isolation — so Prisma failed the joined query outright
-- with "Field tenant is required to return data, got null".
--
-- Same shape as the other bootstrap policy: SELECT only, and only while
-- app.tenant_id is unset. Narrower in one respect — a tenant is readable
-- during bootstrap only if some membership points at it, so orphaned
-- tenant rows stay invisible.
--
-- This does still expose tenant rows to any authenticated database
-- session during that window, so per-user narrowing remains application
-- code's job: membership.repository.ts filters by the caller's own
-- userId, the same arrangement already relied on for the global "users"
-- table. Tightening it further would mean threading a
-- current_setting('app.user_id') GUC through every request — worth doing
-- when the superadmin surface adds a second reader of these tables, but
-- it buys nothing while the only caller already filters by userId.
DROP POLICY IF EXISTS bootstrap_tenant_lookup ON "tenants";
CREATE POLICY bootstrap_tenant_lookup ON "tenants"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND EXISTS (
      SELECT 1 FROM "memberships" m WHERE m."tenantId" = "tenants".id
    )
  );
