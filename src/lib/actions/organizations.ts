"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireRole, generateInviteToken, inviteExpiryDate } from "@/lib/organizations";
import { getSnipBaseUrl } from "@/lib/validations";
import type { OrgRole } from "@/generated/prisma/enums";
import type { ActionResult } from "@/types/action";

const NOT_FOUND_ERROR = "Not found.";
const FORBIDDEN_ERROR = "Only an owner can do that.";
const MAX_NAME_LENGTH = 64;

function validateName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "Name is required." };
  if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, error: "Name is too long." };
  return { ok: true, name: trimmed };
}

export async function createOrganization(name: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in." };
  }

  const nameResult = validateName(name);
  if (!nameResult.ok) {
    return { success: false, error: nameResult.error, field: "name" };
  }

  // Deliberately does NOT switch activeOrganizationId — the user picked a
  // name for a brand-new, empty org; switching into it automatically would
  // yank them out of whatever they were looking at without asking. They
  // switch explicitly via the org switcher when they're ready.
  const organization = await db.organization.create({
    data: {
      name: nameResult.name,
      members: { create: { userId, role: "OWNER" } },
    },
  });

  revalidatePath("/dashboard");
  return { success: true, data: { id: organization.id } };
}

export async function renameOrganization(name: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const nameResult = validateName(name);
  if (!nameResult.ok) {
    return { success: false, error: nameResult.error, field: "name" };
  }

  if (!(await requireRole(organizationId, userId, "OWNER"))) {
    return { success: false, error: FORBIDDEN_ERROR };
  }

  await db.organization.update({ where: { id: organizationId }, data: { name: nameResult.name } });
  revalidatePath("/dashboard/settings");
  return { success: true, data: { id: organizationId } };
}

// Takes effect on the very next request with no extra invalidation needed:
// database-strategy sessions (src/lib/auth.ts) re-join the User row fresh
// every time auth() runs, so there's no stale JWT claim to worry about —
// updating this column is the whole mechanism.
export async function switchActiveOrganization(
  organizationId: string,
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in." };
  }

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  await db.user.update({ where: { id: userId }, data: { activeOrganizationId: organizationId } });
  revalidatePath("/dashboard");
  return { success: true, data: { id: organizationId } };
}

export type InviteResult = { id: string; url: string; token: string; role: OrgRole; expiresAt: Date };

export async function createInvite(role: OrgRole): Promise<ActionResult<InviteResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  if (!(await requireRole(organizationId, userId, "OWNER"))) {
    return { success: false, error: FORBIDDEN_ERROR };
  }

  const invite = await db.organizationInvite.create({
    data: {
      organizationId,
      role,
      invitedByUserId: userId,
      token: generateInviteToken(),
      expiresAt: inviteExpiryDate(),
    },
  });

  revalidatePath("/dashboard/settings");
  // Always the default domain, never a custom one — an invite is an
  // account-level concept unrelated to any specific link's domain.
  return {
    success: true,
    data: {
      id: invite.id,
      url: `${getSnipBaseUrl()}/invite/${invite.token}`,
      token: invite.token,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
  };
}

export async function revokeInvite(id: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  if (!(await requireRole(organizationId, userId, "OWNER"))) {
    return { success: false, error: FORBIDDEN_ERROR };
  }

  const { count } = await db.organizationInvite.deleteMany({ where: { id, organizationId } });
  if (count === 0) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { id } };
}

export type AcceptInviteResult = { organizationId: string; organizationName: string };

export async function acceptInvite(token: string): Promise<ActionResult<AcceptInviteResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in." };
  }

  const invite = await db.organizationInvite.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (!invite) {
    return { success: false, error: "This invite link isn't valid." };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: "This invite link has expired." };
  }

  // Idempotent: a second click, or an already-a-member accepting again,
  // just confirms membership rather than erroring.
  await db.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: invite.organizationId, userId },
    },
    create: { organizationId: invite.organizationId, userId, role: invite.role },
    update: {},
  });

  if (!invite.acceptedAt) {
    await db.organizationInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  }

  await db.user.update({ where: { id: userId }, data: { activeOrganizationId: invite.organizationId } });

  revalidatePath("/dashboard");
  return {
    success: true,
    data: { organizationId: invite.organizationId, organizationName: invite.organization.name },
  };
}

export async function removeMember(memberId: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  if (!(await requireRole(organizationId, userId, "OWNER"))) {
    return { success: false, error: FORBIDDEN_ERROR };
  }

  const target = await db.organizationMember.findFirst({ where: { id: memberId, organizationId } });
  if (!target) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  if (target.role === "OWNER" && (await isLastOwner(organizationId, target.id))) {
    return { success: false, error: "Can't remove the last owner of an organization." };
  }

  await db.organizationMember.delete({ where: { id: memberId } });
  revalidatePath("/dashboard/settings");
  return { success: true, data: { id: memberId } };
}

export async function changeMemberRole(
  memberId: string,
  role: OrgRole,
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  if (!(await requireRole(organizationId, userId, "OWNER"))) {
    return { success: false, error: FORBIDDEN_ERROR };
  }

  const target = await db.organizationMember.findFirst({ where: { id: memberId, organizationId } });
  if (!target) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  if (target.role === "OWNER" && role === "MEMBER" && (await isLastOwner(organizationId, target.id))) {
    return { success: false, error: "Can't demote the last owner of an organization." };
  }

  await db.organizationMember.update({ where: { id: memberId }, data: { role } });
  revalidatePath("/dashboard/settings");
  return { success: true, data: { id: memberId } };
}

export async function leaveOrganization(): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const [organization, membership] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { isPersonal: true } }),
    db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    }),
  ]);
  if (!organization || !membership) {
    return { success: false, error: NOT_FOUND_ERROR };
  }
  if (organization.isPersonal) {
    return { success: false, error: "You can't leave your personal workspace." };
  }
  if (membership.role === "OWNER" && (await isLastOwner(organizationId, membership.id))) {
    return { success: false, error: "Can't leave — you're the last owner. Promote someone else first." };
  }

  await db.organizationMember.delete({ where: { id: membership.id } });

  // Falls back to the personal org — same self-heal the session callback
  // in src/lib/auth.ts does if this ever got missed, done eagerly here so
  // the next page load doesn't show a now-inaccessible org.
  const personal = await db.organizationMember.findFirst({
    where: { userId, organization: { isPersonal: true } },
    select: { organizationId: true },
  });
  await db.user.update({
    where: { id: userId },
    data: { activeOrganizationId: personal?.organizationId ?? null },
  });

  revalidatePath("/dashboard");
  return { success: true, data: { id: organizationId } };
}

async function isLastOwner(organizationId: string, excludingMemberId: string): Promise<boolean> {
  const otherOwners = await db.organizationMember.count({
    where: { organizationId, role: "OWNER", id: { not: excludingMemberId } },
  });
  return otherOwners === 0;
}
