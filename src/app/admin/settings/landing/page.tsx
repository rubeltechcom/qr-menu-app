import { SettingsSurface } from "../settings-page";

/** What a visitor sees before they sign up. */
export const dynamic = "force-dynamic";

export default function LandingSettingsPage() {
  return (
    <SettingsSurface
      heading="Landing page"
      description="The public marketing page: which demo it opens, and which live menus it shows off."
      groupIds={["showcase"]}
    />
  );
}
