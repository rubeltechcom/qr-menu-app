-- Lets a staff PIN screen resolve a restaurant by its slug, and check a
-- PIN against that restaurant's staff.
--
-- The gap this closes: staff sign in with a restaurant slug and a PIN,
-- with no logged-in user and no tenant selected yet. That satisfies none
-- of the existing SELECT policies on "tenants" —
--
--   * tenant_isolation        needs app.tenant_id, which is precisely
--                             what the lookup is trying to discover
--   * bootstrap_tenant_lookup needs app.user_id with a membership, and
--                             a staff member has no session yet
--   * platform_admin_read     needs app.platform_admin
--
-- so the lookup returned nothing and every staff login failed with
-- "restaurant not found", however correct the slug was.
--
-- The fix follows the shape of bootstrap_tenant_lookup: a dedicated GUC,
-- set only for the duration of the login query and transaction-scoped so
-- it cannot leak onto the next borrower of a pooled connection.
--
-- Why this is narrow enough to be safe:
--
--   * SELECT only. It grants no ability to modify anything.
--   * It exposes a restaurant's id and name to someone who already knows
--     its slug — and the slug is public: it is the menu's own subdomain,
--     printed on every QR code in the building.
--   * It cannot be combined with app.tenant_id to widen a scoped
--     session, because it requires app.tenant_id to be unset.
--   * Knowing the id is not authentication. The PIN still has to verify
--     against an Argon2 hash before any session is issued.

-- The tenant behind a slug, during a staff login and nowhere else.
DROP POLICY IF EXISTS staff_login_tenant_lookup ON "tenants";
CREATE POLICY staff_login_tenant_lookup ON "tenants"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND current_setting('app.staff_login', true) = 'on'
  );

-- The candidate memberships whose PINs are then checked. Restricted to
-- the tenant the login is actually for, so one restaurant's login screen
-- can never enumerate another's staff.
DROP POLICY IF EXISTS staff_login_membership_lookup ON "memberships";
CREATE POLICY staff_login_membership_lookup ON "memberships"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND current_setting('app.staff_login', true) = 'on'
    AND "tenantId" = coalesce(current_setting('app.staff_login_tenant', true), '')
  );

-- "users" and "staff_pins" carry no RLS of their own (a user is a global
-- identity, and a PIN hash is meaningless without the membership it
-- hangs off), so the join through them needs no policy here.
