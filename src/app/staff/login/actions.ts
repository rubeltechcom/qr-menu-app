"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffPin } from "@/modules/auth/staff-pin.service";
import {
  createStaffSessionToken,
  STAFF_SESSION_COOKIE_NAME,
  STAFF_SESSION_MAX_AGE,
} from "@/lib/staff-session";
import { rawPrisma } from "@/server/db/client";

export interface StaffLoginFormState {
  error?: string;
}

export async function staffLoginAction(
  _prevState: StaffLoginFormState,
  formData: FormData,
): Promise<StaffLoginFormState> {
  const tenantSlug = formData.get("tenantSlug");
  const pin = formData.get("pin");

  if (typeof tenantSlug !== "string" || typeof pin !== "string" || !tenantSlug || !pin) {
    return { error: "Enter your restaurant and PIN." };
  }

  // Resolving by slug here (rather than trusting a hostname header) so
  // the same PIN screen works whether staff reach it via the platform
  // subdomain or a kiosk bookmark that predates a custom domain.
  const tenant = await rawPrisma.tenant.findUnique({
    where: { slug: tenantSlug.toLowerCase() },
    select: { id: true },
  });
  if (!tenant) {
    return { error: "Restaurant not found." };
  }

  const result = await verifyStaffPin(tenant.id, pin);
  if (!result) {
    return { error: "Incorrect PIN." };
  }

  const token = await createStaffSessionToken(result);
  (await cookies()).set(STAFF_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STAFF_SESSION_MAX_AGE,
    path: "/",
  });

  redirect("/staff");
}
