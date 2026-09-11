import { SettingsSurface } from "../settings-page";

/** Outbound email — Resend, or an operator's own SMTP server. */
export const dynamic = "force-dynamic";

export default function EmailSettingsPage() {
  return (
    <SettingsSurface
      heading="Email & sign-in"
      description="How receipts and account emails are sent, and how owners sign in."
      groupIds={["email", "smtp", "google"]}
    />
  );
}
