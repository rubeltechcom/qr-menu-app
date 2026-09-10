-- Bootstrap lookups for payments, same shape as public_code_lookup on
-- "tables" and track_token_lookup on "orders".
--
-- Two paths need to find a payment before any tenant is known:
--
--   1. A diner returning from bKash or Stripe. They have no session;
--      the payment id in the return URL is what identifies the payment,
--      and resolving it is what establishes the tenant.
--   2. A provider webhook. No session at all, and the tenant has to be
--      derived from the payment the event names.
--
-- SELECT only, and only while app.tenant_id is unset — exactly that
-- bootstrap window. Once resolved, every subsequent read and every
-- write runs through forTenant() under tenant_isolation.
--
-- What keeps this safe is that both references are unguessable: a
-- payment id is a cuid, and reaching one requires already holding it.
-- Nothing here exposes a way to enumerate payments.
CREATE POLICY bootstrap_payment_lookup ON "payments"
  FOR SELECT
  USING (coalesce(current_setting('app.tenant_id', true), '') = '');
