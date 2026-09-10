"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import {
  createConnectOnboardingLink,
  refreshConnectStatus,
} from "@/modules/billing/connect.service";

/** Only an owner decides how the restaurant takes money. */
async function requireOwner(tenantSlug: string) {
  const context = await requireDashboardTenant(tenantSlug);
  if (context.membership.role !== "OWNER") {
    throw new Error("Only the account owner can change payment settings.");
  }
  return context;
}

const modeSchema = z.enum(["COUNTER", "OPTIONAL", "REQUIRED"]);

export async function setPaymentModeAction(tenantSlug: string, formData: FormData) {
  const { db, tenant } = await requireOwner(tenantSlug);
  const mode = modeSchema.parse(formData.get("mode"));

  await db.tenant.update({
    where: { id: tenant.id },
    data: { paymentMode: mode },
  });

  revalidatePath(`/dashboard/${tenantSlug}/payments`);
}

export async function startConnectOnboardingAction(tenantSlug: string) {
  const { tenant, session } = await requireOwner(tenantSlug);
  const base = `${env.APP_URL.replace(/\/+$/, "")}/dashboard/${tenantSlug}/payments`;

  const url = await createConnectOnboardingLink({
    tenantId: tenant.id,
    tenantName: tenant.name,
    ownerEmail: session.user.email ?? "",
    // Coming back does not mean approved — the page re-reads
    // charges_enabled from Stripe rather than assuming.
    returnUrl: `${base}?connect=returned`,
    refreshUrl: `${base}?connect=refresh`,
  });

  redirect(url);
}

export async function refreshConnectStatusAction(tenantSlug: string) {
  const { tenant } = await requireOwner(tenantSlug);
  await refreshConnectStatus(tenant.id);
  revalidatePath(`/dashboard/${tenantSlug}/payments`);
}
