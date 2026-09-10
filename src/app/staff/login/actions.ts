"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffPin } from "@/modules/auth/staff-pin.service";
import {
  createStaffSessionToken,
  STAFF_SESSION_COOKIE_NAME,
  STAFF_SESSION_MAX_AGE,
} from "@/lib/staff-session";
import { findTenantForStaffLogin } from "@/modules/auth/staff-login.repository";

export interface StaffLoginFormState {
  error?: string;
}

export async function staffLoginAction(
  _prevState: StaffLoginFormState,
  formData: FormData,
): Promise<StaffLoginFormState> {
  const rawSlug = formData.get("tenantSlug");
  const rawPin = formData.get("pin");

  // Trimmed before the emptiness check: a tablet's autocorrect adds a
  // trailing space readily, and " " is not a restaurant name.
  const tenantSlug = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
  const pin = typeof rawPin === "string" ? rawPin.trim() : "";

  if (!tenantSlug) {
    return { error: "Enter your restaurant name." };
  }
  if (!pin) {
    return { error: "Enter your PIN." };
  }

  // Resolving by slug here (rather than trusting a hostname header) so
  // the same PIN screen works whether staff reach it via the platform
  // subdomain or a kiosk bookmark that predates a custom domain.
  //
  // Goes through the staff-login repository because "tenants" is
  // RLS-protected and there is no session yet to satisfy the ordinary
  // policies — see the note there.
  const tenant = await findTenantForStaffLogin(tenantSlug);
  if (!tenant) {
    // Names the value that failed: staff mistype the slug constantly,
    // and "not found" alone gives them nothing to correct.
    return { error: `No restaurant called "${tenantSlug}". Check the spelling.` };
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
