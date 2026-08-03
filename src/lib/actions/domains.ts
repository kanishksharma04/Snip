"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hostnameSchema } from "@/lib/validations";
import { isHostnameCollision } from "@/lib/prisma-errors";
import { generateVerifyToken, checkDomainVerification } from "@/lib/domains";
import type { ActionResult } from "@/types/action";

const NOT_FOUND_ERROR = "Domain not found.";
const MAX_DOMAINS_PER_ORGANIZATION = 10;

export type DomainRow = {
  id: string;
  hostname: string;
  verifyToken: string;
  verifiedAt: Date | null;
  createdAt: Date;
};

export async function addDomain(hostname: string): Promise<ActionResult<DomainRow>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const hostnameResult = hostnameSchema.safeParse(hostname);
  if (!hostnameResult.success) {
    return {
      success: false,
      error: hostnameResult.error.issues[0]?.message ?? "Invalid domain.",
      field: "hostname",
    };
  }

  const existingCount = await db.domain.count({ where: { organizationId } });
  if (existingCount >= MAX_DOMAINS_PER_ORGANIZATION) {
    return {
      success: false,
      error: `You can have at most ${MAX_DOMAINS_PER_ORGANIZATION} domains.`,
    };
  }

  try {
    const domain = await db.domain.create({
      data: { userId, organizationId, hostname: hostnameResult.data, verifyToken: generateVerifyToken() },
    });
    revalidatePath("/dashboard/settings");
    return { success: true, data: domain };
  } catch (error) {
    if (isHostnameCollision(error)) {
      return { success: false, error: "That domain is already registered.", field: "hostname" };
    }
    return { success: false, error: "Something went wrong adding that domain." };
  }
}

export async function verifyDomain(id: string): Promise<ActionResult<DomainRow>> {
  const session = await getSession();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const existing = await db.domain.findFirst({ where: { id, organizationId } });
  if (!existing) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  // Idempotent: a domain that's already verified doesn't need a fresh DNS
  // lookup to confirm what's already on record.
  if (existing.verifiedAt) {
    return { success: true, data: existing };
  }

  const result = await checkDomainVerification(existing.hostname, existing.verifyToken);
  if (!result.verified) {
    const message =
      result.reason === "not_found"
        ? "TXT record not found — DNS changes can take a few minutes to propagate."
        : "Could not look up that domain's DNS records. Try again shortly.";
    return { success: false, error: message };
  }

  const domain = await db.domain.update({
    where: { id },
    data: { verifiedAt: new Date() },
  });
  revalidatePath("/dashboard/settings");
  return { success: true, data: domain };
}

export async function deleteDomain(id: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const { count } = await db.domain.deleteMany({ where: { id, organizationId } });
  if (count === 0) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { id } };
}
