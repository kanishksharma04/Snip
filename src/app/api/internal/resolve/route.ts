import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis, LINK_CACHE_PREFIX } from "@/lib/redis";

// Node runtime (the default for route handlers) — this is the only place in
// the redirect path allowed to import Prisma. proxy.ts calls this over fetch
// instead of querying Postgres directly, keeping the redirect path's shape
// as if it were edge-constrained (it verifiably isn't, on this Next.js
// version/Vercel setup — see Step 13's commit message for why we're keeping
// this split anyway).
export const runtime = "nodejs";

// KNOWN GAP, permanent for this project's scope: this endpoint is publicly
// reachable — anyone can POST an arbitrary slug and learn whether it exists,
// its destination, and its active/expiry state, without going through the
// actual redirect. Not addressed by any later step either; noted here
// deliberately rather than silently left unmentioned.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const slug =
    body && typeof body === "object" && "slug" in body ? body.slug : null;

  if (typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json({ found: false }, { status: 400 });
  }

  // Case-sensitive throughout — the Step 8 alphabet includes both cases, so
  // "JzjykHi" and "jzjykhi" are different links. No .toLowerCase() anywhere
  // in this file, including the cache key.
  const cacheKey = `${LINK_CACHE_PREFIX}${slug}`;

  const cached = await redis.get<CachedResult>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { status: cached.found ? 200 : 404 });
  }

  const link = await db.link.findUnique({
    where: { slug },
    select: { destination: true, isActive: true, expiresAt: true },
  });

  if (!link) {
    // Negative caching: without this, a flood of requests for garbage slugs
    // hits Postgres directly on every single one. Short TTL because a slug
    // that doesn't exist yet could be created moments later.
    const notFound: CachedResult = { found: false };
    await redis.set(cacheKey, notFound, { ex: 60 });
    return NextResponse.json(notFound, { status: 404 });
  }

  // expiresAt is normalized to an ISO string (or null) here, once, so
  // CachedResult has exactly one shape whether it just came from Postgres or
  // came back out of Redis after a JSON round trip — Date objects don't
  // survive that round trip, so typing this as Date would be a lie about
  // the cache-hit branch.
  const result: CachedResult = {
    found: true,
    destination: link.destination,
    isActive: link.isActive,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
  };
  await redis.set(cacheKey, result, { ex: 60 * 60 * 24 });
  return NextResponse.json(result);
}

type CachedResult =
  | { found: true; destination: string; isActive: boolean; expiresAt: string | null }
  | { found: false };
