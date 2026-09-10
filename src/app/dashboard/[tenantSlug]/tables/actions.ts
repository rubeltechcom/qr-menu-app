"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import * as tableService from "@/modules/tables/table.service";
import * as locationService from "@/modules/locations/location.service";

/**
 * Every action re-establishes tenant context via requireDashboardTenant()
 * rather than trusting anything the client sent — a Server Action is a
 * public HTTP endpoint, and the slug in the URL is re-checked against the
 * caller's own membership each time (PROMPT.md §5.5).
 */

export async function createLocationAction(tenantSlug: string, formData: FormData) {
  await requireDashboardTenant(tenantSlug);
  await locationService.createMyLocation({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
  });
  revalidatePath(`/dashboard/${tenantSlug}/tables`);
}

export async function createTableAction(
  tenantSlug: string,
  locationId: string,
  formData: FormData,
) {
  await requireDashboardTenant(tenantSlug);
  const seats = formData.get("seats");
  await tableService.createMyTable({
    locationId,
    label: formData.get("label"),
    seats: seats ? Number(seats) : undefined,
  });
  revalidatePath(`/dashboard/${tenantSlug}/tables`);
}

export async function createTableRangeAction(
  tenantSlug: string,
  locationId: string,
  formData: FormData,
) {
  await requireDashboardTenant(tenantSlug);
  await tableService.createMyTableRange({
    locationId,
    from: Number(formData.get("from")),
    to: Number(formData.get("to")),
    prefix: formData.get("prefix") ?? "",
  });
  revalidatePath(`/dashboard/${tenantSlug}/tables`);
}

export async function deleteTableAction(tenantSlug: string, tableId: string) {
  await requireDashboardTenant(tenantSlug);
  await tableService.deleteMyTable(tableId);
  revalidatePath(`/dashboard/${tenantSlug}/tables`);
}

/**
 * Issues a new code and retires the old one — the fix for a QR sticker
 * that has been photographed and is being used to order from off-site.
 */
export async function regenerateTableCodeAction(tenantSlug: string, tableId: string) {
  await requireDashboardTenant(tenantSlug);
  await tableService.regenerateMyTableCode(tableId);
  revalidatePath(`/dashboard/${tenantSlug}/tables`);
}
