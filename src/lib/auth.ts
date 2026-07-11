import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // @auth/prisma-adapter's published types are structurally pinned to Prisma
  // 6's client shape. Prisma 7's generated client exposes the identical model
  // API (user/account/session/verificationToken delegates) but fails strict
  // structural assignability due to internal generic differences — cast to
  // the adapter's own declared parameter type rather than widen to `any`.
  adapter: PrismaAdapter(db as unknown as Parameters<typeof PrismaAdapter>[0]),
  providers: [GitHub],
  // Database sessions read Prisma, which can't run on the edge runtime —
  // auth checks stay in server components, never in middleware.
  session: { strategy: "database" },
});
