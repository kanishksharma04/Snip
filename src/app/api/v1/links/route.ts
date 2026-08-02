import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-auth";
import { apiLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { isSlugCollision } from "@/lib/prisma-errors";
import { generateSlug } from "@/lib/slug";
import { customSlugSchema, destinationSchema, buildShortUrl } from "@/lib/validations";

export const runtime = "nodejs";

const MAX_AUTO_SLUG_RETRIES = 3;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Same page/limit convention as the dashboard's own list (Step 30) — a
// missing or malformed value falls back to the default rather than 400ing,
// since this is a read endpoint where a bad query param is more useful
// treated as "give me the defaults" than as a hard error.
function parsePagination(url: URL): { page: number; limit: number } {
  const page = Number(url.searchParams.get("page"));
  const limit = Number(url.searchParams.get("limit"));
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
  };
}

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
  domain: { hostname: string } | null;
}) {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: buildShortUrl(link),
    destination: link.destination,
    clickCount: link.clickCount,
    isActive: link.isActive,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  };
}

// Same loop-prevention reasoning as src/lib/actions/links.ts's identically
// named check — kept as a separate copy rather than a shared import because
// this is the one place a client (not this codebase's own UI) supplies
// input directly, and duplicating a four-line query here is cheaper than a
// cross-cutting shared module for one call site on each side.
async function pointsAtAVerifiedDomain(destination: string): Promise<boolean> {
  const hostname = new URL(destination).hostname.toLowerCase();
  const match = await db.domain.findFirst({
    where: { hostname, verifiedAt: { not: null } },
    select: { id: true },
  });
  return match !== null;
}

async function resolveDomainId(
  domainId: unknown,
  userId: string,
): Promise<{ ok: true; domainId: string | null } | { ok: false; error: string }> {
  if (domainId === undefined) return { ok: true, domainId: null };
  if (typeof domainId !== "string") {
    return { ok: false, error: "domainId must be a string" };
  }
  const domain = await db.domain.findFirst({
    where: { id: domainId, userId, verifiedAt: { not: null } },
    select: { id: true },
  });
  if (!domain) {
    return { ok: false, error: "That domain isn't available" };
  }
  return { ok: true, domainId: domain.id };
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
  const { destination, customSlug, expiresAt, domainId } = body as Record<string, unknown>;

  const destinationResult = destinationSchema.safeParse(destination);
  if (!destinationResult.success) {
    return NextResponse.json(
      { error: destinationResult.error.issues[0]?.message ?? "Invalid destination URL" },
      { status: 400 },
    );
  }

  if (await pointsAtAVerifiedDomain(destinationResult.data)) {
    return NextResponse.json({ error: "Destination cannot point back to Snip" }, { status: 400 });
  }

  const domainResult = await resolveDomainId(domainId, auth.userId);
  if (!domainResult.ok) {
    return NextResponse.json({ error: domainResult.error }, { status: 400 });
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
          domainId: domainResult.domainId,
        },
        include: { domain: { select: { hostname: true } } },
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
          domainId: domainResult.domainId,
        },
        include: { domain: { select: { hostname: true } } },
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

  const { page, limit } = parsePagination(new URL(request.url));

  const [links, total] = await Promise.all([
    db.link.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        slug: true,
        destination: true,
        clickCount: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
        domain: { select: { hostname: true } },
      },
    }),
    db.link.count({ where: { userId: auth.userId } }),
  ]);

  return NextResponse.json({
    links: links.map(toApiShape),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}
