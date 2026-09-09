import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Use at the top of any server component/layout that must be logged in.
 * Redirects to /login rather than rendering a 401 — this app has no API
 * consumers yet that would need a JSON error instead of a redirect.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}
