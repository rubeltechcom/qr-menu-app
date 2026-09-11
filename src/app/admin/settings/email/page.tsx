import { SettingsSurface } from "../settings-page";

/** Outbound email — Resend, or an operator's own SMTP server. */
export const dynamic = "force-dynamic";

export default function EmailSettingsPage() {
  return (
    <SettingsSurface
      heading="Email & SMTP"
      description="How receipts and account emails are sent. Configure Resend or your own SMTP server."
      groupIds={["email", "smtp"]}
    />
  );
}
