import { SettingsSurface } from "../settings-page";

/** Payment provider credentials and the plan price IDs they bill on. */
export const dynamic = "force-dynamic";

export default function PaymentSettingsPage() {
  return (
    <SettingsSurface
      heading="Payments"
      description="Credentials for the providers that take money, and the price IDs restaurants are billed on. Secrets are encrypted before they are stored."
      groupIds={["stripe", "bkash"]}
    />
  );
}
