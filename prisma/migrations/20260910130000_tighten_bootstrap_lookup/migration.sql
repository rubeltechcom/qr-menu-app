-- Narrows the tenant/membership bootstrap policies to the requesting
-- user, closing a gap left by 20260909200000_membership_owner_lookup.
--
-- The gap: those policies allowed ANY unscoped session to read every
-- membership, and every tenant that had one. The migration that added
-- them said so out loud and deferred the fix ("worth doing when the
-- superadmin surface lands and there is a second reader of these
-- tables"). That surface has now landed, and a test written for the
-- admin panel caught the hole — so this is the moment to close it.
--
-- The fix is the one that note anticipated: a second GUC carrying the
-- signed-in user's id, set for the duration of the bootstrap query, so
-- the database enforces "your own memberships" instead of trusting
-- application code to remember the WHERE clause.
--
-- Both policies stay SELECT-only and still apply only while
-- app.tenant_id is unset — the pre-tenant window and nothing wider.

DROP POLICY IF EXISTS bootstrap_owner_lookup ON "memberships";
CREATE POLICY bootstrap_owner_lookup ON "memberships"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND "userId" = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS bootstrap_tenant_lookup ON "tenants";
CREATE POLICY bootstrap_tenant_lookup ON "tenants"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m."tenantId" = "tenants".id
        AND m."userId" = current_setting('app.user_id', true)
    )
  );
