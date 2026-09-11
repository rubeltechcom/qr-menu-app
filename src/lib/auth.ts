import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifyPassword } from "@/lib/password";
import {
  findOrCreateFederatedUser,
  findUserByEmail,
} from "@/modules/users/user.repository";
import { env } from "@/lib/env";
import { stripLoopbackAuthUrl } from "@/lib/auth-url";
import {
  getSetting,
  loadSettings,
  settingsLoaded,
} from "@/modules/platform/settings.service";

/**
 * Auth.js configuration for restaurant owners/managers (Credentials +
 * Google). Staff (waiter/kitchen) authenticate via a separate PIN flow —
 * see PROMPT.md §5's "Short-lived signed PIN sessions for staff devices"
 * — not through this provider set.
 *
 * Sessions are JWT-based rather than database-backed for now: no
 * Session/VerificationToken models exist yet in prisma/schema.prisma.
 * Switch to the Prisma adapter with database sessions once those models
 * are added, per PROMPT.md §2 ("Auth.js (NextAuth v5) with database
 * sessions").
 */
/**
 * Whether Google sign-in is usable, and with which credentials.
 *
 * Read from platform settings with the environment as the fallback, so
 * an operator can turn Google on from /admin without a redeploy. Shared
 * with the login and signup pages, which hide the button when this
 * returns null — a button that opens a Google error page is worse than
 * no button, and the operator would not see it themselves.
 */
// Before Auth.js reads the environment: a loopback AUTH_URL inherited
// from a build placeholder would otherwise point every OAuth callback
// at localhost. See auth-url.ts.
stripLoopbackAuthUrl(process.env, env.APP_URL);

export async function googleCredentials(): Promise<{
  id: string;
  secret: string;
} | null> {
  // The settings snapshot is per-process and is warmed by
  // instrumentation.ts, but /api/auth/* can be served by a worker that
  // has not done that yet — which showed up as the button rendering
  // while Google was missing from the provider list, so clicking it
  // failed. Loading here makes the auth route independent of boot order.
  if (!settingsLoaded()) await loadSettings();

  const id = getSetting("google.clientId")?.trim() || env.GOOGLE_CLIENT_ID;
  const secret = getSetting("google.clientSecret")?.trim() || env.GOOGLE_CLIENT_SECRET;

  return id && secret ? { id, secret } : null;
}

// A function config rather than an object: it is evaluated per request,
// which is what lets the Google credentials come from the settings
// table. An object literal would be built when this module is first
// imported — possibly before instrumentation.ts has loaded settings —
// and would then be frozen for the life of the process, so turning
// Google on in the admin panel would do nothing until a redeploy.
export const { handlers, signIn, signOut, auth } = NextAuth(async () => ({
  // Auth.js refuses to serve any endpoint on a host it does not trust, to
  // stop a spoofed Host header pointing a callback somewhere else. In dev
  // it trusts localhost implicitly, so a missing setting only shows up in
  // production — as a blanket 500 on every /api/auth/* route reading
  // "There was a problem with the server configuration".
  //
  // trustHost tells Auth.js to accept the host forwarded by the reverse
  // proxy the app runs behind (Vercel, or a container behind nginx), which
  // is required for it to work there at all.
  //
  // The safety condition that comes with it: the proxy must set
  // X-Forwarded-Host itself and not pass a client-supplied one through.
  // Vercel and a correctly configured nginx both do. If this ever runs
  // somewhere that doesn't, pin the host there instead of relaxing it here.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await findUserByEmail(email.toLowerCase());
        if (!user?.hashedPassword) {
          return null;
        }

        const valid = await verifyPassword(user.hashedPassword, password);
        if (!valid) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(await (async () => {
      const google = await googleCredentials();
      return google ? [Google({ clientId: google.id, clientSecret: google.secret })] : [];
    })()),
  ],
  callbacks: {
    /**
     * Turns a Google identity into one of our users.
     *
     * Without this, a Google sign-in would succeed and then carry
     * Google's own id as `token.userId` — an id no row in our database
     * has — so every page behind auth would behave as though the user
     * did not exist. The account is created here on first sign-in and
     * `user.id` is rewritten to ours, which is what the jwt callback
     * below then stores.
     *
     * Credentials sign-ins already carry a real id and pass straight
     * through.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      // Google returns email_verified; an unverified address must not
      // be able to claim an existing account by email.
      if (profile && profile.email_verified === false) return false;

      const email = user.email ?? profile?.email;
      if (!email) return false;

      const record = await findOrCreateFederatedUser({
        email,
        name: user.name ?? profile?.name ?? null,
        avatarUrl: user.image ?? null,
      });

      // Null means the account is suspended.
      if (!record) return false;

      user.id = record.id;
      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
}));
