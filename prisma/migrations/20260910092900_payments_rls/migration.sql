-- Row-Level Security for the Phase 5 payment tables — same pattern
-- established in 20260909183100_row_level_security.

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_refunds"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- webhook_events is the exception, and deliberately so.
--
-- A webhook arrives from Stripe or bKash with no session and no tenant:
-- the whole point of recording the event id BEFORE processing it is to
-- make a retry idempotent, and that has to happen before we know (or
-- even trust) which tenant it concerns. Some events — a Connect account
-- update for an account we have not linked yet — have no tenant at all,
-- which is why tenantId is nullable here.
--
-- So the table carries RLS but no FORCE, and the tenant policy applies
-- only once a tenant IS known. Rows are written by the webhook handler
-- through the raw client after signature verification; nothing in the
-- app reads this table on behalf of a diner or a logged-in user.
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook_events"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
