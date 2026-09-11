"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { saveSettings } from "@/modules/platform/settings.service";
import { SETTING_BY_KEY } from "@/modules/platform/settings.schema";

export interface SettingsFormState {
  ok?: boolean;
  error?: string;
  savedAt?: number;
}

/**
 * Saves platform settings.
 *
 * Guarded by requireSuperadmin() like every other admin surface: a
 * Server Action is a public HTTP endpoint, and this one can change the
 * payment credentials the whole platform runs on.
 */
export async function saveSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { user } = await requireSuperadmin();

  const values: Record<string, string> = {};

  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;

    // Only keys declared in the settings schema are accepted — the
    // allowlist that stops an arbitrary row being written.
    const definition = SETTING_BY_KEY.get(field);
    if (!definition) continue;

    // A secret field renders masked. Submitting the mask unchanged must
    // not overwrite the real key with a row of dots, so anything that
    // still looks like a mask is skipped.
    if (definition.kind === "secret" && raw.includes("•")) continue;

    values[field] = raw;
  }

  // An unchecked checkbox submits nothing at all, so booleans are read
  // from the form's presence rather than from the loop above.
  for (const [key, definition] of SETTING_BY_KEY) {
    if (definition.kind !== "boolean") continue;
    // Only when the group containing it was actually submitted.
    if (!formData.has(`${key}.present`)) continue;
    values[key] = formData.get(key) === "on" ? "true" : "false";
  }

  try {
    await saveSettings(values, user.email ?? user.id);
  } catch (error) {
    console.error("[admin] failed to save settings", error);
    return { error: "Could not save those settings. Please try again." };
  }

  // saveSettings refreshes the in-memory snapshot, but the rendered
  // pages that read it are cached separately. Landing copy, prices and
  // the demo link all live on the public pages, so an operator who
  // saved a new headline and then looked at the home page would
  // otherwise still see the old one and reasonably conclude it had not
  // saved. Layout scope clears the marketing pages beneath it too.
  revalidatePath("/admin/settings");
  revalidatePath("/admin/plans");
  revalidatePath("/", "layout");

  return { ok: true, savedAt: Date.now() };
}
