import { googleCredentials } from "@/lib/auth";
import { loadSettings, settingsLoaded } from "@/modules/platform/settings.service";
import { LoginForm } from "./login-form";

/**
 * Whether Google sign-in is offered is a server decision, so the form
 * itself stays a client component and this only passes the flag down.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!settingsLoaded()) await loadSettings();
  return <LoginForm googleEnabled={(await googleCredentials()) !== null} />;
}
