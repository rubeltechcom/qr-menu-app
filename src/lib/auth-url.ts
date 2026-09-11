/**
 * Stops a stale AUTH_URL from breaking every sign-in.
 *
 * Auth.js overrides the request's own URL whenever AUTH_URL or
 * NEXTAUTH_URL is set, and builds every OAuth redirect_uri from it. A
 * deployment that inherited `http://localhost:3000` — from a Dockerfile
 * placeholder, a copied .env, or a platform that fills one in — will
 * therefore complete a Google sign-in and then send the user to their
 * own machine. Nothing looks wrong until the last hop, which fails with
 * an SSL error naming localhost rather than anything the operator
 * recognises, and the same variable silently breaks every other
 * callback too.
 *
 * The app already knows its real address: APP_URL, which the same
 * deployment sets correctly for QR codes and menu links. So a loopback
 * value is treated as the mistake it is and removed, leaving
 * `trustHost` to read the host the proxy actually forwarded.
 *
 * Separate from auth.ts so it can be tested without importing NextAuth.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function stripLoopbackAuthUrl(
  environment: Record<string, string | undefined>,
  appUrl: string,
  warn: (message: string) => void = console.warn,
): void {
  // A developer's machine has a loopback AUTH_URL for good reason.
  let appIsLocal: boolean;
  try {
    appIsLocal = LOOPBACK_HOSTS.has(new URL(appUrl).hostname);
  } catch {
    appIsLocal = false;
  }

  for (const key of ["AUTH_URL", "NEXTAUTH_URL"]) {
    const value = environment[key];
    if (!value) continue;

    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      // Unparseable: Auth.js would get nothing useful from it either,
      // so drop it rather than leave it to fail obscurely later.
      warn(`[auth] Ignoring ${key}="${value}": not a valid URL.`);
      delete environment[key];
      continue;
    }

    if (!LOOPBACK_HOSTS.has(host) || appIsLocal) continue;

    warn(
      `[auth] Ignoring ${key}=${value}: this deployment serves ${appUrl}. ` +
        `Leaving it set would send every OAuth callback to localhost. ` +
        `Remove it from the environment to silence this.`,
    );
    delete environment[key];
  }
}
