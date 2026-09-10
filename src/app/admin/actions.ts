"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { setTenantSuspended } from "@/modules/platform/platform.repository";

/**
 * Platform admin actions.
 *
 * Each re-checks superadmin from the database rather than trusting the
 * session — a Server Action is a public HTTP endpoint, and this one can
 * take a restaurant offline.
 */
export async function suspendTenantAction(tenantId: string) {
  await requireSuperadmin();
  await setTenantSuspended(tenantId, true);
  revalidatePath("/admin");
}

export async function restoreTenantAction(tenantId: string) {
  await requireSuperadmin();
  await setTenantSuspended(tenantId, false);
  revalidatePath("/admin");
}
