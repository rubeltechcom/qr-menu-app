import { SettingsSurface } from "./settings-page";

/**
 * General platform configuration — the settings with no better home.
 * Payments, landing-page content and email each have their own screen.
 */
export const dynamic = "force-dynamic";

export default function GeneralSettingsPage() {
  return (
    <SettingsSurface
      heading="General settings"
      description="How the platform presents itself, order alerts, and upload limits. Changes take effect immediately — no redeploy."
      groupIds={["platform", "alerts", "uploads"]}
      showStorage
    />
  );
}
