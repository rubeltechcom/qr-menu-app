"use client";

import { useActionState, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import type { RenderedSetting } from "@/modules/platform/settings.service";
import { saveSettingsAction, type SettingsFormState } from "./actions";

const initialState: SettingsFormState = {};

interface RenderedGroup {
  id: string;
  title: string;
  description: string;
  settings: RenderedSetting[];
}

/**
 * The platform configuration form.
 *
 * Rendered from the settings schema rather than hand-written, so adding
 * a setting is one entry in settings.schema.ts and nothing here changes.
 *
 * Each group is its own <form> with its own save button. One form
 * spanning every group meant that correcting a Stripe key also
 * re-submitted the upload limits and the platform name — and a single
 * failure took the whole page with it. Saving a group now touches only
 * that group, and says so where the operator is looking.
 */
export function SettingsForm({ groups }: { groups: RenderedGroup[] }) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <SettingsGroup key={group.id} group={group} />
      ))}
    </div>
  );
}

function SettingsGroup({ group }: { group: RenderedGroup }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initialState);

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
    >
      <div className="border-b border-zinc-200 px-6 py-5">
        <h2 className="text-base font-semibold text-zinc-900">{group.title}</h2>
        <p className="mt-1 text-sm text-zinc-600">{group.description}</p>
      </div>

      <div className="flex flex-col divide-y divide-zinc-100">
        {group.settings.map((setting) => (
          <Field key={setting.key} setting={setting} />
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : `Save ${group.title.toLowerCase()}`}
        </button>

        {state.ok && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" />
            Saved — live immediately.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-sm font-medium text-red-600">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ setting }: { setting: RenderedSetting }) {
  if (setting.kind === "boolean") {
    return <BooleanField setting={setting} />;
  }

  return (
    <div className="px-6 py-5">
      <label htmlFor={setting.key} className="text-sm font-medium text-zinc-900">
        {setting.label}
      </label>
      {setting.hint && <p className="mt-0.5 text-xs text-zinc-500">{setting.hint}</p>}

      {setting.kind === "secret" ? (
        <SecretInput setting={setting} />
      ) : setting.kind === "multiline" ? (
        <textarea
          id={setting.key}
          name={setting.key}
          rows={4}
          defaultValue={setting.displayValue}
          placeholder={setting.placeholder}
          spellCheck={false}
          className={FIELD_CLASS}
        />
      ) : (
        <input
          id={setting.key}
          name={setting.key}
          type={setting.kind === "number" ? "number" : "text"}
          // 0 is meaningful for some numbers (repeat-every-0-seconds
          // means "play once"), so the floor is 0, not 1.
          min={setting.kind === "number" ? 0 : undefined}
          defaultValue={setting.displayValue}
          placeholder={setting.placeholder}
          autoComplete="off"
          spellCheck={false}
          className={FIELD_CLASS}
        />
      )}

      <SourceNote setting={setting} />
    </div>
  );
}

const FIELD_CLASS =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 font-mono text-sm text-zinc-900 transition-colors outline-none placeholder:font-sans placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

/**
 * A real switch, with a knob that moves.
 *
 * This was a bare `appearance-none` checkbox whose only styling was a
 * background colour, so it rendered as a grey pill with nothing in it —
 * no knob, no tick, no visible difference between on and off unless you
 * knew which shade meant what. Operators reported the toggles as simply
 * not showing up, which was fair.
 *
 * Kept as a real <input type="checkbox"> underneath so it still submits
 * with the form and remains keyboard-operable; the visible switch is
 * drawn with peer-* classes that follow the input's checked state.
 */
function BooleanField({ setting }: { setting: RenderedSetting }) {
  const isOn = setting.displayValue !== "false";

  return (
    <div className="flex items-start justify-between gap-6 px-6 py-5">
      <div className="min-w-0">
        <label htmlFor={setting.key} className="text-sm font-medium text-zinc-900">
          {setting.label}
        </label>
        {setting.hint && <p className="mt-0.5 text-xs text-zinc-500">{setting.hint}</p>}
        <SourceNote setting={setting} />
      </div>

      {/* Marks the checkbox as submitted: an unchecked box sends
          nothing, which is indistinguishable from "not on the form". */}
      <input type="hidden" name={`${setting.key}.present`} value="1" />

      <label
        htmlFor={setting.key}
        className="relative inline-flex shrink-0 cursor-pointer items-center"
      >
        <input
          id={setting.key}
          name={setting.key}
          type="checkbox"
          defaultChecked={isOn}
          className="peer sr-only"
        />
        <span className="block h-6 w-11 rounded-full bg-zinc-300 transition-colors peer-checked:bg-green-600 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900/20 peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  );
}

/**
 * A secret, with a reveal toggle.
 *
 * Masked by default because these are live payment credentials and the
 * page is often open on a shared screen. Revealing shows only the mask
 * for an already-saved value — the real secret is never sent to the
 * browser — so this is about checking what you just typed.
 */
function SecretInput({ setting }: { setting: RenderedSetting }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative">
      <input
        id={setting.key}
        name={setting.key}
        type={revealed ? "text" : "password"}
        defaultValue={setting.displayValue}
        placeholder={setting.placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`${FIELD_CLASS} pr-11`}
      />
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-label={revealed ? "Hide" : "Show"}
        className="absolute top-1/2 right-2 mt-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SourceNote({ setting }: { setting: RenderedSetting }) {
  if (!setting.isSet) {
    return (
      <p className="mt-1.5 text-xs text-zinc-400">
        Not set{setting.envVar ? ` · falls back to ${setting.envVar}` : ""}
      </p>
    );
  }

  return (
    <p className="mt-1.5 text-xs text-zinc-500">
      {setting.fromEnv
        ? `From the environment (${setting.envVar}) — saving here overrides it.`
        : setting.kind === "secret"
          ? "Saved and encrypted."
          : "Saved here."}
    </p>
  );
}
