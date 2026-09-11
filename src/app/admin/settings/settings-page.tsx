import { requireSuperadmin } from "@/lib/require-superadmin";
import {
  loadSettings,
  renderSettings,
  settingsLoaded,
} from "@/modules/platform/settings.service";
import { describeStorage } from "@/modules/storage/registry";
import { SettingsForm } from "./settings-form";

/**
 * One settings screen, filtered to a set of groups.
 *
 * The schema drives the whole admin area, so rather than writing a page
 * per topic, each route picks the groups it owns. A group therefore
 * appears in exactly one place, and adding one is still a single entry
 * in settings.schema.ts.
 */
export async function SettingsSurface({
  heading,
  description,
  groupIds,
  showStorage = false,
}: {
  heading: string;
  description: string;
  /** Groups to render, in this order. */
  groupIds: string[];
  showStorage?: boolean;
}) {
  await requireSuperadmin();

  // The boot-time load runs in instrumentation.ts, but a page rendered
  // before that completes (or in a fresh worker) would show empty
  // fields. Cheap to guarantee here.
  if (!settingsLoaded()) await loadSettings();

  const all = renderSettings();
  const groups = groupIds
    .map((id) => all.find((group) => group.id === id))
    .filter((group): group is (typeof all)[number] => group !== undefined);

  const storage = showStorage ? describeStorage() : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{heading}</h2>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>

      <SettingsForm groups={groups} />

      {/* Read-only, because it is decided by the deployment rather than
          by a form — but an operator still needs to know which it is. */}
      {storage && (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
          <h3 className="font-semibold text-zinc-900">File storage</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Menu photos and videos are stored on{" "}
            <span className="font-medium text-zinc-900">{storage.displayName}</span>
            {storage.detail ? ` (${storage.detail})` : ""}.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Set by the deployment, not here: local disk needs a mounted volume, and S3
            needs credentials the server reads at startup. See DEPLOYMENT.md.
          </p>
        </section>
      )}
    </div>
  );
}
