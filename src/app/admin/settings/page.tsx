import { requireSuperadmin } from "@/lib/require-superadmin";
import {
  loadSettings,
  renderSettings,
  settingsLoaded,
} from "@/modules/platform/settings.service";
import { describeStorage } from "@/modules/storage/registry";
import { SettingsForm } from "./settings-form";

/**
 * Platform configuration.
 *
 * Everything an operator would otherwise have to set as an environment
 * variable and redeploy for: payment credentials, plan price IDs,
 * upload limits, platform naming. Saving takes effect immediately —
 * the settings snapshot the payment providers read is refreshed as part
 * of the save.
 */
export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  await requireSuperadmin();

  // The boot-time load runs in instrumentation.ts, but a page rendered
  // before that completes (or in a fresh serverless worker) would show
  // empty fields. Cheap to guarantee here.
  if (!settingsLoaded()) await loadSettings();

  const groups = renderSettings();
  const storage = describeStorage();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          Platform settings
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Configure the platform without redeploying. Secrets are encrypted before they
          are stored.
        </p>
      </div>

      <SettingsForm groups={groups} />

      {/* Read-only, because it is decided by the deployment rather than
          by a form — but an operator still needs to know which it is. */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
        <h3 className="font-semibold text-zinc-900">File storage</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Menu photos and videos are stored on{" "}
          <span className="font-medium text-zinc-900">{storage.displayName}</span>
          {storage.detail ? ` (${storage.detail})` : ""}.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Set by the deployment, not here: local disk needs a mounted volume, and S3 needs
          credentials the server reads at startup. See DEPLOYMENT.md.
        </p>
      </section>
    </div>
  );
}
