import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { provisionPersonalOrganization } from "@/lib/organizations";

// @auth/prisma-adapter's published types are structurally pinned to Prisma
// 6's client shape. Prisma 7's generated client exposes the identical model
// API (user/account/session/verificationToken delegates) but fails strict
// structural assignability due to internal generic differences — cast to
// the adapter's own declared parameter type rather than widen to `any`.
const baseAdapter = PrismaAdapter(db as unknown as Parameters<typeof PrismaAdapter>[0]);

// Wraps the adapter to provision a personal organization atomically the
// instant a brand-new User row is created — the same idiom Vercel/Linear/
// Notion use for "you always land in a personal workspace." This only fires
// for users created after organizations shipped; everyone who already
// existed got the equivalent result once from
// scripts/backfill-organizations.ts. The two paths never overlap, so every
// real user ends up provisioned by exactly one of them.
const adapter: typeof baseAdapter = {
  ...baseAdapter,
  async createUser(data) {
    const user = await baseAdapter.createUser!(data);
    await provisionPersonalOrganization(user.id, user.name ?? null);
    return user;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [GitHub],
  // Database sessions read Prisma, which can't run on the edge runtime —
  // auth checks stay in server components, never in middleware.
  session: { strategy: "database" },
  callbacks: {
    // Database strategy passes the full Prisma User row here (not just the
    // adapter's narrower AdapterUser fields) — cast to reach
    // activeOrganizationId, which the adapter's own types don't know about,
    // same reasoning as the cast above.
    async session({ session, user }) {
      const dbUser = user as unknown as { id: string; activeOrganizationId: string | null };
      session.user.id = dbUser.id;

      const membership = dbUser.activeOrganizationId
        ? await db.organizationMember.findUnique({
            where: {
              organizationId_userId: { organizationId: dbUser.activeOrganizationId, userId: dbUser.id },
            },
            select: { organizationId: true, role: true },
          })
        : null;

      if (membership) {
        session.user.organizationId = membership.organizationId;
        session.user.role = membership.role;
        return session;
      }

      // Self-heals the one real edge case this opens up: an owner removed
      // this user from their active org. Falls back to their personal org,
      // which always exists and they're always OWNER of, and persists the
      // fix so it isn't re-derived on every request.
      const personal = await db.organizationMember.findFirst({
        where: { userId: dbUser.id, organization: { isPersonal: true } },
        select: { organizationId: true, role: true },
      });
      session.user.organizationId = personal?.organizationId ?? null;
      session.user.role = personal?.role ?? null;
      if (personal) {
        await db.user.update({
          where: { id: dbUser.id },
          data: { activeOrganizationId: personal.organizationId },
        });
      }
      return session;
    },
  },
});
