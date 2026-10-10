/*
 * Authentication (next-auth v4, Credentials provider, JWT sessions).
 * Internal system: login only — no public registration.
 */
import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { findUserByLogin, upgradePasswordHash } from "@/server/store";
import { hashPassword, verifyPassword } from "./password";
import type { Role } from "@/types";

const loginSchema = z.object({
  login: z.string().trim().min(1, "أدخل اسم المستخدم أو البريد الإلكتروني"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "بيانات الدخول",
      credentials: {
        login: { label: "اسم المستخدم أو البريد الإلكتروني", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await findUserByLogin(parsed.data.login);
        if (!user || !user.active) return null;

        // Lazy hash upgrade for env-seeded demo admin (plain:... prefix)
        if (user.passwordHash.startsWith("plain:")) {
          const ok = user.passwordHash === `plain:${parsed.data.password}`;
          if (!ok) return null;
          const hash = await hashPassword(parsed.data.password);
          await upgradePasswordHash(user.id, hash);
        } else if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.username = (token.username as string) ?? "";
        session.user.role = (token.role as Role) ?? "ADMIN";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/** Current session user (server components / route handlers), or null. */
export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}
