"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { destinationSchema, getSnipBaseUrl } from "@/lib/validations";
import { anonymousLinkCreationLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { isSlugCollision } from "@/lib/prisma-errors";
import type { ActionResult } from "@/types/action";

const MAX_AUTO_SLUG_RETRIES = 3;
const DEMO_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export type CreateAnonymousLinkResult = { shortUrl: string; expiresAt: string };

// No session, no userId — anonymous demo links belong to nobody (Link.userId
// is nullable specifically for this) and always self-expire in 24h, so this
// never becomes a way to get a permanent free link without an account.
export async function createAnonymousLink(
  destination: string,
): Promise<ActionResult<CreateAnonymousLinkResult>> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rateLimitResult = await anonymousLinkCreationLimit.limit(ip);
  if (!rateLimitResult.success) {
    const minutes = Math.ceil(retryAfterSeconds(rateLimitResult.reset) / 60);
    return {
      success: false,
      error: `Demo limit reached (10/hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or sign in for a full account.`,
    };
  }

  const destinationResult = destinationSchema.safeParse(destination);
  if (!destinationResult.success) {
    return {
      success: false,
      error: destinationResult.error.issues[0]?.message ?? "Invalid destination URL.",
    };
  }

  const expiresAt = new Date(Date.now() + DEMO_LINK_TTL_MS);

  for (let attempt = 0; attempt < MAX_AUTO_SLUG_RETRIES; attempt++) {
    const slug = generateSlug();
    try {
      const link = await db.link.create({
        data: { userId: null, slug, destination: destinationResult.data, expiresAt },
      });
      return {
        success: true,
        data: { shortUrl: `${getSnipBaseUrl()}/${link.slug}`, expiresAt: expiresAt.toISOString() },
      };
    } catch (error) {
      if (isSlugCollision(error)) continue;
      return { success: false, error: "Something went wrong creating your demo link." };
    }
  }

  return { success: false, error: "Could not generate a unique slug. Please try again." };
}
