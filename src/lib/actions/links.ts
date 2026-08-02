"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateSlug } from "@/lib/slug";
import { customSlugSchema, destinationSchema, buildShortUrl } from "@/lib/validations";
import { redis, LINK_CACHE_PREFIX } from "@/lib/redis";
import { authenticatedLinkCreationLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { isSlugCollision } from "@/lib/prisma-errors";
import type { Link } from "@/generated/prisma/client";
import type { ActionResult } from "@/types/action";

const NOT_FOUND_ERROR = "Link not found.";

const MAX_AUTO_SLUG_RETRIES = 3;

export type CreateLinkInput = {
  destination: string;
  customSlug?: string;
  expiresAt?: Date;
  domainId?: string;
};

type LinkWithDomain = Link & { domain: { hostname: string } | null };

// The short URL is built here, server-side — buildShortUrl falls back to
// SNIP_BASE_URL (a server-only env var) when the link has no domain
// attached. The client never constructs this URL itself; it only renders
// what the action gives it.
export type CreateLinkResult = Link & { shortUrl: string };

function toResult(link: LinkWithDomain): CreateLinkResult {
  return { ...link, shortUrl: buildShortUrl(link) };
}

// Attack: same class as destinationSchema's own SNIP_BASE_URL loop check,
// extended to cover custom domains — a link whose destination is any
// verified domain (this user's or anyone else's) would loop back into Snip,
// since a verified domain is presumed to actually route here. Requires a DB
// query, so it can't live inside the shared (client-safe, synchronous)
// destinationSchema — this runs only on the server, right after that schema
// passes.
async function pointsAtAVerifiedDomain(destination: string): Promise<boolean> {
  const hostname = new URL(destination).hostname.toLowerCase();
  const match = await db.domain.findFirst({
    where: { hostname, verifiedAt: { not: null } },
    select: { id: true },
  });
  return match !== null;
}

const DOMAIN_LOOP_ERROR = "Destination cannot point back to Snip.";

// Re-validates and resolves a client-supplied domainId into a Prisma
// `data` fragment — never trusts the claim that a domain belongs to this
// user, the same trust boundary every other write in this file enforces.
async function resolveDomainId(
  domainId: string | undefined,
  userId: string,
): Promise<{ ok: true; domainId: string | null } | { ok: false; error: string }> {
  if (domainId === undefined) return { ok: true, domainId: null };

  const domain = await db.domain.findFirst({
    where: { id: domainId, userId, verifiedAt: { not: null } },
    select: { id: true },
  });
  if (!domain) {
    return { ok: false, error: "That domain isn't available." };
  }
  return { ok: true, domainId: domain.id };
}

export async function createLink(
  input: CreateLinkInput,
): Promise<ActionResult<CreateLinkResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in to create a link." };
  }

  // Server Actions have no HTTP status code to return a real 429 with — the
  // idiom this codebase already uses for every other rejected input is an
  // ActionResult failure, so an exceeded limit refuses the request the same
  // way a taken slug or invalid URL does, rather than silently succeeding.
  const rateLimitResult = await authenticatedLinkCreationLimit.limit(userId);
  if (!rateLimitResult.success) {
    const minutes = Math.ceil(retryAfterSeconds(rateLimitResult.reset) / 60);
    return {
      success: false,
      error: `You've hit the hourly link creation limit (100/hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const destinationResult = destinationSchema.safeParse(input.destination);
  if (!destinationResult.success) {
    return {
      success: false,
      error: destinationResult.error.issues[0]?.message ?? "Invalid destination URL.",
    };
  }
  const destination = destinationResult.data;

  if (await pointsAtAVerifiedDomain(destination)) {
    return { success: false, error: DOMAIN_LOOP_ERROR };
  }

  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: "Expiry date must be in the future." };
  }

  const domainResult = await resolveDomainId(input.domainId, userId);
  if (!domainResult.ok) {
    return { success: false, error: domainResult.error, field: "domainId" };
  }
  const domainId = domainResult.domainId;

  if (input.customSlug !== undefined) {
    const slugResult = customSlugSchema.safeParse(input.customSlug);
    if (!slugResult.success) {
      return {
        success: false,
        error: slugResult.error.issues[0]?.message ?? "Invalid slug.",
      };
    }
    const slug = slugResult.data;

    // Custom slug: no retry on collision. The user asked for this exact
    // slug — silently handing them a different one would be wrong. Insert
    // directly and let the database's unique constraint catch a race
    // (no check-then-insert, which would leave a TOCTOU gap under
    // concurrency).
    try {
      const link = await db.link.create({
        // userId comes from the session only, never from `input` — a
        // client could put any userId in a form field, and trusting it
        // would let one user create links owned by someone else. domainId
        // is resolved (and re-verified as this user's own) above, same
        // reasoning.
        data: { userId, slug, destination, expiresAt: input.expiresAt, domainId },
        include: { domain: { select: { hostname: true } } },
      });
      revalidatePath("/dashboard");
      return { success: true, data: toResult(link) };
    } catch (error) {
      if (isSlugCollision(error)) {
        // Field-specific: this is the user's own input being wrong, not a
        // system failure — it belongs under the customSlug input, not a
        // generic toast.
        return { success: false, error: "That slug is already taken.", field: "customSlug" };
      }
      return { success: false, error: "Something went wrong creating your link." };
    }
  }

  // Auto-generated slug: retry with a fresh random slug on collision. Step
  // 8's keyspace math puts the odds of any single collision at ~1 in 1.95
  // million even at 1M existing links, so a handful of retries is enough —
  // exhausting all of them signals something else is wrong, not bad luck.
  for (let attempt = 0; attempt < MAX_AUTO_SLUG_RETRIES; attempt++) {
    const slug = generateSlug();
    try {
      const link = await db.link.create({
        data: { userId, slug, destination, expiresAt: input.expiresAt, domainId },
        include: { domain: { select: { hostname: true } } },
      });
      revalidatePath("/dashboard");
      return { success: true, data: toResult(link) };
    } catch (error) {
      if (isSlugCollision(error)) {
        continue;
      }
      return { success: false, error: "Something went wrong creating your link." };
    }
  }

  return {
    success: false,
    error: "Could not generate a unique slug. Please try again.",
  };
}

export type UpdateLinkInput = {
  destination?: string;
  expiresAt?: Date | null;
};

export async function updateLink(
  linkId: string,
  input: UpdateLinkInput,
): Promise<ActionResult<CreateLinkResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in." };
  }

  const existing = await db.link.findUnique({
    where: { id: linkId },
    select: { userId: true, slug: true },
  });
  // Same response for "doesn't exist" and "exists but isn't yours" — a
  // distinct message for the latter would let a user probe which link IDs
  // are real.
  if (!existing || existing.userId !== userId) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  let destination: string | undefined;
  if (input.destination !== undefined) {
    const result = destinationSchema.safeParse(input.destination);
    if (!result.success) {
      return {
        success: false,
        error: result.error.issues[0]?.message ?? "Invalid destination URL.",
        field: "destination",
      };
    }
    destination = result.data;
    if (await pointsAtAVerifiedDomain(destination)) {
      return { success: false, error: DOMAIN_LOOP_ERROR, field: "destination" };
    }
  }

  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: "Expiry date must be in the future.", field: "expiresAt" };
  }

  // Scoped by userId as well as id — belt-and-braces alongside the read
  // above, so the actual mutation can never apply to a row this session
  // doesn't own even if that changed between the two statements.
  const { count } = await db.link.updateMany({
    where: { id: linkId, userId },
    data: {
      ...(destination !== undefined ? { destination } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    },
  });
  if (count === 0) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const updated = await db.link.findUniqueOrThrow({
    where: { id: linkId },
    include: { domain: { select: { hostname: true } } },
  });

  // Cache invalidation: one exact known key, deleted before returning —
  // never a pattern, never SCAN/KEYS. A stale cache entry on an updated
  // link is a correctness bug (visitors keep going to the old destination
  // until the 24h TTL expires), not a performance detail.
  await redis.del(`${LINK_CACHE_PREFIX}${existing.slug}`);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${linkId}`);
  return { success: true, data: toResult(updated) };
}

export async function deleteLink(linkId: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in." };
  }

  const existing = await db.link.findUnique({
    where: { id: linkId },
    select: { userId: true, slug: true },
  });
  if (!existing || existing.userId !== userId) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const { count } = await db.link.deleteMany({ where: { id: linkId, userId } });
  if (count === 0) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  await redis.del(`${LINK_CACHE_PREFIX}${existing.slug}`);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${linkId}`);
  return { success: true, data: { id: linkId } };
}

export async function toggleLinkActive(
  linkId: string,
): Promise<ActionResult<CreateLinkResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in." };
  }

  const existing = await db.link.findUnique({
    where: { id: linkId },
    select: { userId: true, slug: true, isActive: true },
  });
  if (!existing || existing.userId !== userId) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const { count } = await db.link.updateMany({
    where: { id: linkId, userId },
    data: { isActive: !existing.isActive },
  });
  if (count === 0) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const updated = await db.link.findUniqueOrThrow({
    where: { id: linkId },
    include: { domain: { select: { hostname: true } } },
  });

  // Disabling a link must take effect on the very next request — a stale
  // "active" cache entry would keep redirecting after the owner turned it
  // off, which is the same class of bug as the update case above.
  await redis.del(`${LINK_CACHE_PREFIX}${existing.slug}`);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${linkId}`);
  return { success: true, data: toResult(updated) };
}
