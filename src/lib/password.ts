import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing — Argon2id, per PROMPT.md §5.5.
 *
 * Never hand-roll parameters here without a reason; these defaults match
 * OWASP's current Argon2id recommendation for interactive login.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export function verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
  return verify(hashedPassword, plainPassword);
}
