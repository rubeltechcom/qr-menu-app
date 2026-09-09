import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  STAFF_SESSION_COOKIE_NAME,
  verifyStaffSessionToken,
  type StaffSessionPayload,
} from "@/lib/staff-session";

/**
 * Use at the top of any staff-console server component/layout
 * (PROMPT.md §6.3). Redirects to the PIN entry screen rather than
 * rendering an error — a tablet at a host stand should never show a
 * stack trace.
 */
export async function requireStaffSession(): Promise<StaffSessionPayload> {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyStaffSessionToken(token) : null;

  if (!session) {
    redirect("/staff/login");
  }

  return session;
}
