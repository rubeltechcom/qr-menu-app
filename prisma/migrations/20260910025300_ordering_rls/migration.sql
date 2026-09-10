-- Row-Level Security for the Phase 4 ordering tables — same pattern
-- established in 20260909183100_row_level_security.

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "orders"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_items"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_events"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "order_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_counters"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
