import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Encryption for secrets held in the database.
 *
 * Payment credentials configured from the admin panel have to be
 * readable by the server and unreadable in a backup file. AES-256-GCM
 * gives both, and being authenticated it also means a tampered row
 * fails loudly instead of decrypting to garbage that is then sent to a
 * payment provider.
 *
 * The key is derived from AUTH_SECRET, which every install already has
 * and already treats as a secret. That has one consequence worth
 * stating plainly: **rotating AUTH_SECRET makes existing encrypted
 * settings unreadable**, and they must be re-entered. Sessions break on
 * that rotation anyway, so the two are already linked.
 */

const ALGORITHM = "aes-256-gcm";
/** Distinguishes a value this module wrote from a plain one. */
const PREFIX = "enc.v1:";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  // scrypt rather than using AUTH_SECRET's bytes directly: it is a
  // passphrase, not a uniformly random 32-byte key.
  cachedKey ??= scryptSync(env.AUTH_SECRET, "qrmenu.platform-settings.v1", 32);
  return cachedKey;
}

/** True for a value produced by encryptSecret(). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  // A fresh IV per encryption — reusing one under GCM is catastrophic.
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/**
 * Reverses encryptSecret().
 *
 * Returns null rather than throwing when a value cannot be read — a
 * setting written under a previous AUTH_SECRET should surface as "not
 * configured" and be re-entered, not crash every request that needs it.
 */
export function decryptSecret(value: string): string | null {
  if (!isEncrypted(value)) return value;

  try {
    const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(".");
    if (!ivPart || !tagPart || !dataPart) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, or a tampered row. Either way it is unusable.
    return null;
  }
}

/**
 * A secret rendered for the admin UI: enough to recognise which key is
 * in place, never enough to use it.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "••••••••";
  return `${plaintext.slice(0, 4)}${"•".repeat(12)}${plaintext.slice(-4)}`;
}
