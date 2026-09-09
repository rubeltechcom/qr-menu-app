import { hashPassword, verifyPassword } from "@/lib/password";
import { rawPrisma } from "@/server/db/client";

/**
 * Staff PIN authentication — for waiters/kitchen on a shared tablet, per
 * PROMPT.md §2/§5: "Short-lived signed PIN sessions for staff devices...
 * a waiter should not need an email login". This is deliberately
 * separate from Auth.js's owner/manager Credentials+Google flow.
 *
 * A PIN is scoped to one Membership (one person, one tenant, one role)
 * and is looked up by tenant + numeric PIN — not by any global identity —
 * since two different tenants' staff may pick the same 4-6 digit PIN.
 */

export class StaffPinError extends Error {}

const PIN_PATTERN = /^\d{4,6}$/;

export async function setStaffPin(membershipId: string, pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) {
    throw new StaffPinError("PIN must be 4 to 6 digits.");
  }
  const hashedPin = await hashPassword(pin);
  await rawPrisma.staffPin.upsert({
    where: { membershipId },
    create: { membershipId, hashedPin },
    update: { hashedPin },
  });
}

export interface StaffLoginResult {
  membershipId: string;
  tenantId: string;
  userId: string;
  role: string;
  name: string | null;
}

/**
 * Verifies a PIN against every staff PIN record under the given tenant.
 * There is no indexed lookup by "tenantId + pin" (the PIN is hashed), so
 * this checks each candidate — acceptable at staff-roster scale (tens of
 * people per location, not thousands) and it means a leaked hash table
 * for tenant A tells you nothing usable about tenant B even by
 * coincidence of PIN reuse.
 */
export async function verifyStaffPin(tenantId: string, pin: string): Promise<StaffLoginResult | null> {
  if (!PIN_PATTERN.test(pin)) return null;

  const candidates = await rawPrisma.staffPin.findMany({
    where: { membership: { tenantId, deletedAt: null } },
    include: { membership: { include: { user: true } } },
  });

  for (const candidate of candidates) {
    const matches = await verifyPassword(candidate.hashedPin, pin);
    if (matches) {
      return {
        membershipId: candidate.membershipId,
        tenantId,
        userId: candidate.membership.userId,
        role: candidate.membership.role,
        name: candidate.membership.user.name,
      };
    }
  }

  return null;
}
