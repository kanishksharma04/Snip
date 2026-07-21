import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-auth";
import { apiLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { isSlugCollision } from "@/lib/prisma-errors";
import { generateSlug } from "@/lib/slug";
import { customSlugSchema, destinationSchema, getSnipBaseUrl } from "@/lib/validations";

export const runtime = "nodejs";

const MAX_AUTO_SLUG_RETRIES = 3;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function checkApiRateLimit(apiKeyId: string) {
  const result = await apiLimit.limit(apiKeyId);
  if (result.success) return null;
  return NextResponse.json(
    { error: "Rate limit exceeded. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds(result.reset)) } },
  );
}

function toApiShape(link: {
  id: string;
  slug: string;
  destination: string;
  clickCount: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: `${getSnipBaseUrl()}/${link.slug}`,
    destination: link.destination,
    clickCount: link.clickCount,
    isActive: link.isActive,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  };
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return unauthorized();

  const rateLimitResponse = await checkApiRateLimit(auth.apiKeyId);
  if (rateLimitResponse) return rateLimitResponse;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { destination, customSlug, expiresAt } = body as Record<string, unknown>;

  const destinationResult = destinationSchema.safeParse(destination);
  if (!destinationResult.success) {
    return NextResponse.json(
      { error: destinationResult.error.issues[0]?.message ?? "Invalid destination URL" },
      { status: 400 },
    );
  }

  let expiresAtDate: Date | undefined;
  if (expiresAt !== undefined) {
    if (typeof expiresAt !== "string") {
      return NextResponse.json({ error: "expiresAt must be an ISO 8601 date string" }, { status: 400 });
    }
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
    }
    expiresAtDate = parsed;
  }

  if (customSlug !== undefined) {
    const slugResult = customSlugSchema.safeParse(customSlug);
    if (!slugResult.success) {
      return NextResponse.json(
        { error: slugResult.error.issues[0]?.message ?? "Invalid slug" },
        { status: 400 },
      );
    }

    try {
      const link = await db.link.create({
        data: {
          userId: auth.userId,
          slug: slugResult.data,
          destination: destinationResult.data,
          expiresAt: expiresAtDate,
        },
      });
      return NextResponse.json(toApiShape(link), { status: 201 });
    } catch (error) {
      if (isSlugCollision(error)) {
        return NextResponse.json({ error: "That slug is already taken" }, { status: 409 });
      }
      return NextResponse.json({ error: "Something went wrong creating the link" }, { status: 500 });
    }
  }

  for (let attempt = 0; attempt < MAX_AUTO_SLUG_RETRIES; attempt++) {
    try {
      const link = await db.link.create({
        data: {
          userId: auth.userId,
          slug: generateSlug(),
          destination: destinationResult.data,
          expiresAt: expiresAtDate,
        },
      });
      return NextResponse.json(toApiShape(link), { status: 201 });
    } catch (error) {
      if (isSlugCollision(error)) continue;
      return NextResponse.json({ error: "Something went wrong creating the link" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Could not generate a unique slug" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return unauthorized();

  const rateLimitResponse = await checkApiRateLimit(auth.apiKeyId);
  if (rateLimitResponse) return rateLimitResponse;

  const links = await db.link.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      destination: true,
      clickCount: true,
      isActive: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ links: links.map(toApiShape) });
}
