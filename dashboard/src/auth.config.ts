import type { DefaultSession, AuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import { LoginSchema } from "@/schemas/auth";
import { getUserByEmail } from "@/data/user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession["user"];
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const authConfig: AuthOptions = {
  providers: [
    Google({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "Email / Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) return null;
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await getUserByEmail(parsed.data.email);
        if (!user?.password) return null;
        const isValid = await bcrypt.compare(parsed.data.password, user.password);
        return isValid ? user : null;
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user = session.user ?? { name: null, email: null, image: null };
      ;(session.user as any).id = token.sub!;
      if (token.role) (session.user as any).role = token.role as string;
      return session;
    },

    async jwt({ token, user }) {
      if (user && "role" in user) {
        token.role = user.role as string;
      }
      return token;
    },
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
  },
};

export default authConfig;
