"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateApiKey } from "@/lib/api-keys";
import type { ActionResult } from "@/types/action";

const NOT_FOUND_ERROR = "API key not found.";
const MAX_NAME_LENGTH = 64;

export type CreateApiKeyResult = { id: string; name: string; keyPrefix: string; plaintext: string };

// plaintext only ever appears in this one return value — nothing this app
// stores afterward (keyHash, keyPrefix) can reconstruct it. The caller must
// show it to the user immediately; there is no way to retrieve it again.
export async function createApiKey(name: string): Promise<ActionResult<CreateApiKeyResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { success: false, error: "Name is required.", field: "name" };
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return { success: false, error: "Name is too long.", field: "name" };
  }

  const { plaintext, keyHash, keyPrefix } = generateApiKey();

  // Bound to this organization for the key's whole lifetime, regardless of
  // which org its creator has active later — see api-auth.ts's comment.
  const apiKey = await db.apiKey.create({
    data: { userId, organizationId, name: trimmedName, keyHash, keyPrefix },
    select: { id: true, name: true, keyPrefix: true },
  });

  revalidatePath("/dashboard/settings");
  return { success: true, data: { ...apiKey, plaintext } };
}

export async function revokeApiKey(id: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    return { success: false, error: "You must be signed in." };
  }

  const { count } = await db.apiKey.updateMany({
    where: { id, organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { id } };
}
