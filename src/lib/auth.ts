import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifyPassword } from "@/lib/password";
import { findUserByEmail } from "@/modules/users/user.repository";
import { env } from "@/lib/env";

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
export const { handlers, signIn, signOut, auth } = NextAuth({
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
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
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
});
