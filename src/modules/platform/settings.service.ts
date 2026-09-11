import { rawPrisma } from "@/server/db/client";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secret-box";
import {
  SETTING_BY_KEY,
  SETTING_DEFAULTS,
  SETTING_GROUPS,
  type SettingDefinition,
} from "./settings.schema";

/**
 * Platform configuration, resolved from three places in order:
 *
 *   1. the database — what the operator set in /admin
 *   2. the environment — what the deploy was configured with
 *   3. a built-in default
 *
 * Environment stays a fallback rather than being replaced, so an
 * install that is already running keeps working after this ships: the
 * database only overrides what someone has actually chosen to change.
 *
 * Reads are synchronous against an in-memory snapshot, because the
 * payment providers that need these values are synchronous and called
 * on hot paths. The snapshot is loaded at boot (instrumentation.ts) and
 * refreshed whenever a setting is saved.
 */

type Snapshot = Map<string, string>;

let snapshot: Snapshot = new Map();
let loaded = false;

/** Maps a setting key to the environment variable it falls back to. */
function envFallback(definition: SettingDefinition): string | undefined {
  if (!definition.envVar) return undefined;
  const value = (env as unknown as Record<string, unknown>)[definition.envVar];
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

/**
 * Reloads every setting from the database.
 *
 * Failure is not fatal: the app falls back to environment variables,
 * which is exactly how it behaved before settings existed. A platform
 * that cannot reach its settings table should still take orders.
 */
export async function loadSettings(): Promise<void> {
  try {
    const rows = await rawPrisma.platformSetting.findMany();
    const next: Snapshot = new Map();

    for (const row of rows) {
      const value = row.isSecret ? decryptSecret(row.value) : row.value;
      // A secret that cannot be decrypted (AUTH_SECRET was rotated) is
      // treated as unset, so the env fallback or "not configured"
      // applies rather than a corrupt key reaching a payment provider.
      if (value !== null) next.set(row.key, value);
    }

    snapshot = next;
    loaded = true;
  } catch (error) {
    console.warn(
      "[settings] could not load platform settings; falling back to environment",
      error,
    );
  }
}

/** True once the database has been read at least once. */
export function settingsLoaded(): boolean {
  return loaded;
}

/**
 * The effective value of a setting, or undefined when nothing has
 * configured it anywhere.
 */
export function getSetting(key: string): string | undefined {
  const stored = snapshot.get(key);
  if (stored !== undefined && stored !== "") return stored;

  const definition = SETTING_BY_KEY.get(key);
  if (definition) {
    const fromEnv = envFallback(definition);
    if (fromEnv !== undefined) return fromEnv;
  }

  return SETTING_DEFAULTS[key];
}

/** Boolean settings, where "false" and "off" both mean false. */
export function getBooleanSetting(key: string, fallback: boolean): boolean {
  const value = getSetting(key);
  if (value === undefined) return fallback;
  return !["false", "off", "0", "no"].includes(value.toLowerCase());
}

export function getNumberSetting(key: string, fallback: number): number {
  const value = Number(getSetting(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Saves a batch of settings.
 *
 * A blank value clears the setting rather than storing an empty string,
 * so clearing a field in the admin UI falls back to the environment
 * variable instead of overriding it with nothing.
 *
 * Secrets are written back only when changed: the form renders them
 * masked, and submitting the mask unchanged must not overwrite the real
 * key with a row of dots.
 */
export async function saveSettings(
  values: Record<string, string>,
  updatedBy: string,
): Promise<void> {
  const writes: Array<Promise<unknown>> = [];

  for (const [key, raw] of Object.entries(values)) {
    const definition = SETTING_BY_KEY.get(key);
    // Ignore anything not declared in the schema — a server action is a
    // public endpoint, and this is its allowlist.
    if (!definition) continue;

    const value = raw.trim();

    if (value === "") {
      writes.push(rawPrisma.platformSetting.deleteMany({ where: { key } }));
      continue;
    }

    const isSecret = definition.kind === "secret";
    const stored = isSecret ? encryptSecret(value) : value;

    writes.push(
      rawPrisma.platformSetting.upsert({
        where: { key },
        create: { key, value: stored, isSecret, updatedBy },
        update: { value: stored, isSecret, updatedBy },
      }),
    );
  }

  await Promise.all(writes);
  // Refresh immediately, so the next request sees the new value without
  // a redeploy — the entire point of this table.
  await loadSettings();
}

export interface RenderedSetting extends SettingDefinition {
  /** What the form shows. Secrets are masked; never the real value. */
  displayValue: string;
  /** Whether anything at all is configured, from any source. */
  isSet: boolean;
  /** True when the value is coming from the environment, not the database. */
  fromEnv: boolean;
}

/** The settings page's data, with secrets masked for display. */
export function renderSettings() {
  return SETTING_GROUPS.map((group) => ({
    ...group,
    settings: group.settings.map((definition): RenderedSetting => {
      const value = getSetting(definition.key);
      const fromEnv =
        !snapshot.has(definition.key) && envFallback(definition) !== undefined;

      return {
        ...definition,
        displayValue:
          value === undefined
            ? ""
            : definition.kind === "secret"
              ? maskSecret(value)
              : value,
        isSet: value !== undefined && value !== "",
        fromEnv,
      };
    }),
  }));
}
