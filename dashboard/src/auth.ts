import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import authConfig from "./auth.config";

export const authOptions = {
  adapter: PrismaAdapter(db),
  ...authConfig,
};

export default NextAuth(authOptions);
