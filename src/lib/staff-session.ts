import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/**
 * Short-lived signed staff sessions (PROMPT.md §2/§5), kept deliberately
 * separate from Auth.js:
 *   - Owners/managers get long-lived, database-relevant JWT sessions via
 *     Auth.js Credentials/Google.
 *   - Staff get a short-lived (shift-length) signed token identifying
 *     their Membership, issued after a PIN check, stored in its own
 *     cookie so a shared tablet's staff session and an owner's personal
 *     login session never collide.
 */
const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_SESSION_TTL_SECONDS = 60 * 60 * 12; // one shift

export interface StaffSessionPayload {
  membershipId: string;
  tenantId: string;
  userId: string;
  role: string;
  name: string | null;
}

function secretKey() {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export async function createStaffSessionToken(
  payload: StaffSessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STAFF_SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyStaffSessionToken(
  token: string,
): Promise<StaffSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.membershipId === "string" &&
      typeof payload.tenantId === "string" &&
      typeof payload.userId === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        membershipId: payload.membershipId,
        tenantId: payload.tenantId,
        userId: payload.userId,
        role: payload.role,
        name: typeof payload.name === "string" ? payload.name : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const STAFF_SESSION_COOKIE_NAME = STAFF_SESSION_COOKIE;
export const STAFF_SESSION_MAX_AGE = STAFF_SESSION_TTL_SECONDS;
