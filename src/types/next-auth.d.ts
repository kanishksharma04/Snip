import type { DefaultSession } from "next-auth";
import type { OrgRole } from "@/generated/prisma/enums";

// Populated by the session callback in src/lib/auth.ts. organizationId/role
// are null only in the moment before a session callback has ever resolved
// them for this user — in practice every real user always has an active
// organization (see provisionPersonalOrganization and
// scripts/backfill-organizations.ts), so treat null defensively but expect
// it never to actually happen for a signed-in user.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string | null;
      role: OrgRole | null;
    } & DefaultSession["user"];
  }
}
