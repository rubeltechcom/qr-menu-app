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
