"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateSlug } from "@/lib/slug";
import { customSlugSchema, destinationSchema, getSnipBaseUrl } from "@/lib/validations";
import { Prisma, type Link } from "@/generated/prisma/client";
import type { ActionResult } from "@/types/action";

const MAX_AUTO_SLUG_RETRIES = 3;

export type CreateLinkInput = {
  destination: string;
  customSlug?: string;
  expiresAt?: Date;
};

// The short URL is built here, server-side, from SNIP_BASE_URL — that env
// var is server-only (not NEXT_PUBLIC_-prefixed) so a Client Component
// reading it directly would get `undefined` at runtime, not a build error.
// The client never constructs this URL itself; it only renders what the
// action gives it.
export type CreateLinkResult = Link & { shortUrl: string };

function toResult(link: Link): CreateLinkResult {
  return { ...link, shortUrl: `${getSnipBaseUrl()}/${link.slug}` };
}

// Prisma 7 + the pg driver adapter does NOT put the violated column names in
// a top-level `meta.target` the way classic Prisma did — verified directly
// against a real P2002 error, not assumed. The field list actually lives at
// meta.driverAdapterError.cause.constraint.fields. `meta` is typed as
// Record<string, unknown> (Prisma gives no stronger contract here), so this
// walk is defensive at every level rather than cast through.
function getUniqueConstraintFields(
  error: Prisma.PrismaClientKnownRequestError,
): string[] {
  const meta = error.meta;
  if (!meta || typeof meta !== "object") return [];

  const driverAdapterError = (meta as Record<string, unknown>).driverAdapterError;
  if (!driverAdapterError || typeof driverAdapterError !== "object") return [];

  const cause = (driverAdapterError as Record<string, unknown>).cause;
  if (!cause || typeof cause !== "object") return [];

  const constraint = (cause as Record<string, unknown>).constraint;
  if (!constraint || typeof constraint !== "object") return [];

  const fields = (constraint as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return [];

  return fields.filter((field): field is string => typeof field === "string");
}

// A catch-all `catch (e)` would treat a genuine database outage as a slug
// collision and retry through it three times before reporting the wrong
// cause. Collision handling only applies to P2002 on the slug column
// specifically — any other error (or a P2002 on a different constraint)
// must fail immediately.
function isSlugCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  return getUniqueConstraintFields(error).includes("slug");
}

export async function createLink(
  input: CreateLinkInput,
): Promise<ActionResult<CreateLinkResult>> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, error: "You must be signed in to create a link." };
  }

  const destinationResult = destinationSchema.safeParse(input.destination);
  if (!destinationResult.success) {
    return {
      success: false,
      error: destinationResult.error.issues[0]?.message ?? "Invalid destination URL.",
    };
  }
  const destination = destinationResult.data;

  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: "Expiry date must be in the future." };
  }

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
        // would let one user create links owned by someone else.
        data: { userId, slug, destination, expiresAt: input.expiresAt },
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
        data: { userId, slug, destination, expiresAt: input.expiresAt },
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
