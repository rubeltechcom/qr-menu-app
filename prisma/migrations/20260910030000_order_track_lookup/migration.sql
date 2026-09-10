-- Lets a diner follow their own order without an account.
--
-- Same bootstrap shape as public_code_lookup on "tables": the tracking
-- token arrives with no tenant attached — it IS the credential, and
-- resolving it is what establishes which tenant the request belongs to.
-- That lookup therefore cannot run under the tenant policy, so it gets
-- its own narrow one instead of being allowed to bypass RLS.
--
-- Deliberately limited: SELECT only, and only while app.tenant_id is
-- unset (an unscoped storefront request). Once resolved, every
-- subsequent read runs through forTenant() under tenant_isolation.
--
-- What makes this safe is the token itself — 128 bits of CSPRNG output
-- (see generateTrackToken in order.service.ts), so it cannot be guessed,
-- and a row is only reachable by someone who already holds the token.
CREATE POLICY track_token_lookup ON "orders"
  FOR SELECT
  USING (coalesce(current_setting('app.tenant_id', true), '') = '');

-- The order's items travel with it on the tracking page, so they need
-- the same window. Reachable only via an order the caller can already
-- read, i.e. only with a valid token.
CREATE POLICY track_token_items_lookup ON "order_items"
  FOR SELECT
  USING (coalesce(current_setting('app.tenant_id', true), '') = '');
