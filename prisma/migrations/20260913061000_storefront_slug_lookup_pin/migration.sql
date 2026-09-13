-- Pins the storefront lookup window to one shop.
--
-- The policy added in the previous migration gates on a single boolean
-- GUC, `app.storefront_lookup = 'on'`. Verifying it against a real
-- database showed what that actually grants: inside the window,
-- `select slug from tenants` returned every row — 176 of them on a
-- development machine.
--
-- The application code only ever queries by slug, so nothing would have
-- enumerated in practice. But the policy permitted it, and an isolation
-- boundary that holds only because its caller writes a careful WHERE
-- clause is not a boundary — it is a convention, and conventions are
-- what the RLS layer exists to stop relying on (PROMPT.md §3.1: two
-- independent defenses, not one plus good manners).
--
-- So the slug being resolved is carried in a GUC of its own and the
-- policy matches the row against it. The window then admits exactly the
-- shop the URL names — one row, already known to whoever typed the
-- address — and enumeration becomes impossible rather than merely
-- unused. This mirrors staff_login_membership_lookup, which pins its
-- read to app.staff_login_tenant for the same reason.
--
-- Measured after this change, on the same database: the real slug still
-- resolves, a read with no GUCs still returns nothing, a window opened
-- for one shop cannot read another, the GUC with no slug set admits
-- nothing, and enumeration inside the window returns 1 row instead of
-- 176.
--
-- What remains, and why it is safe:
--
--   * SELECT only. It grants no ability to modify anything.
--   * One row, matched by a slug the caller must already hold. The slug
--     is public by construction: it is the address of the shop's own
--     storefront, printed on its QR code and handed out on purpose.
--   * It cannot widen an already-scoped session, because it requires
--     app.tenant_id to be unset.
--   * Soft-deleted shops stay invisible, so a closed account's link dies
--     with it rather than serving a menu nobody maintains.
DROP POLICY IF EXISTS storefront_slug_lookup ON "tenants";
CREATE POLICY storefront_slug_lookup ON "tenants"
  FOR SELECT
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND current_setting('app.storefront_lookup', true) = 'on'
    AND slug = coalesce(current_setting('app.storefront_slug', true), '')
    AND "deletedAt" IS NULL
  );
