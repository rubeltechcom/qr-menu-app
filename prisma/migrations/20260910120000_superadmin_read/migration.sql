-- Platform-wide reads for the superadmin area.
--
-- The problem: the admin panel legitimately needs to list every
-- restaurant, but "tenants" is FORCE ROW LEVEL SECURITY, so even the
-- table owner cannot read it unscoped.
--
-- Two ways to solve it, and the difference matters:
--
--   Rejected: `ALTER TABLE ... NO FORCE` around the query. That is
--   global DDL, not connection-local — for the moment it is lifted,
--   EVERY concurrent request on every connection reads that table with
--   policies disabled. A busy server would leak across tenants during
--   the window, and the window widens under load. The demo seed can get
--   away with it because it runs alone; application code cannot.
--
--   Chosen: a policy keyed on a separate GUC that only the superadmin
--   path sets. It is connection-local (set_config with `true` scopes it
--   to the transaction), it is explicit at the call site, and it grants
--   SELECT only — the admin panel can look at everything and change
--   nothing through this route.
--
-- Suspending a restaurant still goes through the ordinary tenant
-- context, so the one destructive action stays under the normal policy.
CREATE POLICY platform_admin_read ON "tenants"
  FOR SELECT
  USING (current_setting('app.platform_admin', true) = 'on');
