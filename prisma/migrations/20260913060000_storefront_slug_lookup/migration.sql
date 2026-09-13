-- Lets a shopper reach a storefront from the shop's own link.
--
-- Until now every storefront began at a table's QR code: /t/<publicCode>
-- resolved a row in "tables", and that row is what said which tenant the
-- request belonged to (see public_code_lookup in
-- 20260909192500_storefront_tables_rls).
--
-- That works for a restaurant with printed table codes and for nothing
-- else. A grocer, a furniture shop, a tea stall with one counter — they
-- have a single link and no tables at all, so there is no publicCode to
-- resolve and no way to discover the tenant. The slug in the URL is the
-- only thing the request carries.
--
-- That lookup satisfies none of the existing SELECT policies on
-- "tenants":
--
--   * tenant_isolation          needs app.tenant_id, which is exactly
--                               what the lookup is trying to discover
--   * bootstrap_tenant_lookup   needs app.user_id with a membership, and
--                               a shopper has no account at all
--   * staff_login_tenant_lookup needs app.staff_login
--   * platform_admin_read       needs app.platform_admin
--
-- so without this the shop link resolves to nothing and every storefront
-- 404s, however correct the slug is.
--
-- Follows the shape of staff_login_tenant_lookup: a dedicated GUC, set
-- only for the duration of the lookup and transaction-scoped, so it
-- cannot leak onto the next borrower of a pooled connection.
--
-- NOTE: this grants SELECT on every non-deleted tenant while the window
-- is open, which is wider than it needs to be. The very next migration
-- (20260913061000_storefront_slug_lookup_pin) narrows it to the single
-- shop the URL names. The two are kept separate rather than edited into
-- one file because this one has already been applied, and rewriting an
-- applied migration changes its checksum without re-running it — so the
-- fix would reach a fresh database and silently skip every existing one.
DROP POLICY IF EXISTS storefront_slug_lookup ON "tenants";
CREATE POLICY storefront_slug_lookup ON "tenants"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND current_setting('app.storefront_lookup', true) = 'on'
    AND "deletedAt" IS NULL
  );
