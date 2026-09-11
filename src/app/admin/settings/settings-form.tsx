"use client";

import { useActionState } from "react";
import { Check, Info } from "lucide-react";
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
 */
export function SettingsForm({ groups }: { groups: RenderedGroup[] }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {groups.map((group) => (
        <section
          key={group.id}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">{group.title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{group.description}</p>

          <div className="mt-6 flex flex-col gap-5">
            {group.settings.map((setting) => (
              <Field key={setting.key} setting={setting} />
            ))}
          </div>
        </section>
      ))}

      {/* Sticky, because these forms are long and the save button
          otherwise sits below several screens of fields. */}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-4 border-t border-zinc-200 bg-white/90 px-1 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>

        {state.ok && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" />
            Saved — changes are live immediately.
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
    const isOn = setting.displayValue !== "false";
    return (
      <div className="flex items-start justify-between gap-6">
        <div>
          <label htmlFor={setting.key} className="text-sm font-medium text-zinc-900">
            {setting.label}
          </label>
          {setting.hint && <p className="mt-0.5 text-xs text-zinc-500">{setting.hint}</p>}
          <SourceNote setting={setting} />
        </div>
        {/* Marks the checkbox as submitted: an unchecked box sends
            nothing, which is indistinguishable from "not on the form". */}
        <input type="hidden" name={`${setting.key}.present`} value="1" />
        <input
          id={setting.key}
          name={setting.key}
          type="checkbox"
          defaultChecked={isOn}
          className="mt-1 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-zinc-300 transition-colors checked:bg-green-600"
        />
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 font-mono text-sm text-zinc-900 transition-colors outline-none placeholder:font-sans placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

  return (
    <div>
      <label htmlFor={setting.key} className="text-sm font-medium text-zinc-900">
        {setting.label}
      </label>
      {setting.hint && <p className="mt-0.5 text-xs text-zinc-500">{setting.hint}</p>}

      {setting.kind === "multiline" ? (
        <textarea
          id={setting.key}
          name={setting.key}
          rows={4}
          defaultValue={setting.displayValue}
          placeholder={setting.placeholder}
          spellCheck={false}
          className={fieldClass}
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
          className={fieldClass}
        />
      )}

      <SourceNote setting={setting} />
    </div>
  );
}

/**
 * Where the current value came from.
 *
 * Worth showing: a value inherited from an environment variable looks
 * identical to one saved here, and an operator editing a field needs to
 * know they are about to override the deploy's configuration.
 */
function SourceNote({ setting }: { setting: RenderedSetting }) {
  if (!setting.isSet) {
    return (
      <p className="mt-1.5 text-xs text-zinc-400">
        Not configured{setting.envVar ? ` · falls back to ${setting.envVar}` : ""}
      </p>
    );
  }

  if (setting.fromEnv) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
        <Info className="h-3.5 w-3.5" />
        From the {setting.envVar} environment variable. Saving here overrides it.
      </p>
    );
  }

  return (
    <p className="mt-1.5 text-xs text-green-700">
      {setting.kind === "secret" ? "Saved and encrypted." : "Saved here."}
    </p>
  );
}
