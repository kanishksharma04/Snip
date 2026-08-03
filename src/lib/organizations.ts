import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { OrgRole } from "@/generated/prisma/enums";

// Runs once, atomically, the moment a brand-new User row is created (see
// the wrapped adapter in src/lib/auth.ts) — every user that signs up after
// this feature shipped gets a personal organization this way. Users who
// already existed get the equivalent result from
// scripts/backfill-organizations.ts instead; the two paths never overlap.
export async function provisionPersonalOrganization(
  userId: string,
  displayName: string | null,
): Promise<{ organizationId: string }> {
  const trimmedName = displayName?.trim();
  const organization = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: trimmedName ? `${trimmedName}'s workspace` : "Personal workspace",
        isPersonal: true,
      },
    });
    await tx.organizationMember.create({
      data: { organizationId: org.id, userId, role: "OWNER" },
    });
    await tx.user.update({
      where: { id: userId },
      data: { activeOrganizationId: org.id },
    });
    return org;
  });
  return { organizationId: organization.id };
}

export async function getMembership(organizationId: string, userId: string) {
  return db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
}

// "MEMBER" is satisfied by any real membership (the lower rung); "OWNER"
// requires the membership's role to actually be OWNER. Every OWNER-only
// server action in src/lib/actions/organizations.ts calls this rather than
// re-querying OrganizationMember and comparing roles inline five times.
export async function requireRole(
  organizationId: string,
  userId: string,
  role: OrgRole,
): Promise<boolean> {
  const membership = await getMembership(organizationId, userId);
  if (!membership) return false;
  return role === "MEMBER" ? true : membership.role === role;
}

export function getUserOrganizations(userId: string) {
  return db.organizationMember.findMany({
    where: { userId },
    // Personal workspace first (it's always where a user starts and always
    // exists), then alphabetical among any team orgs they've joined.
    orderBy: [{ organization: { isPersonal: "desc" } }, { organization: { name: "asc" } }],
    select: {
      role: true,
      organization: { select: { id: true, name: true, isPersonal: true } },
    },
  });
}

const INVITE_TOKEN_BYTES = 24;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function inviteExpiryDate(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_MS);
}
