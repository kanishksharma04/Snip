import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { redis, LINK_CACHE_PREFIX } from "@/lib/redis";
import { getGeo, hashIp, normalizeReferrer, parseUserAgent } from "@/lib/analytics";
import { redirectLimit, retryAfterSeconds } from "@/lib/ratelimit";

// HARD CONSTRAINT: this file must never import Prisma or anything that
// transitively imports it (e.g. @/lib/db, @/lib/actions/*). On this Next.js
// version (16) "Middleware" was renamed to "Proxy", and this project's real
// deployment confirms it now runs as a plain Node.js Lambda, not the edge
// runtime the older docs describe — verified directly via `vercel inspect`
// on a real deployment (lambda.runtime: "nodejs24.x", edge: null). A direct
// Prisma import here would in fact work today. We keep this split anyway:
// the redirect path fetches a separate Node-runtime route handler instead of
// querying Postgres inline, on purpose, to preserve the architecture Phase 3
// is built to teach (cache-first redirects) rather than because the runtime
// forces it. @/lib/redis and @/lib/analytics have no Prisma dependency, so
// using them directly here is safe under this same constraint.
type ResolveResult =
  | { found: true; destination: string; isActive: boolean; expiresAt: string | null }
  | { found: false };

function isLinkExpired(result: Extract<ResolveResult, { found: true }>): boolean {
  return result.expiresAt !== null && new Date(result.expiresAt) <= new Date();
}

function buildResponse(result: ResolveResult, origin: string): NextResponse {
  if (!result.found) {
    // Let Next.js render its own not-found page rather than rewriting to a
    // custom route — there's no extra content to show beyond "not found".
    return NextResponse.next();
  }

  if (!result.isActive || isLinkExpired(result)) {
    return NextResponse.redirect(new URL("/expired", origin), { status: 302 });
  }

  // 302, explicit: NextResponse.redirect() defaults to 307, which preserves
  // the request method — wrong semantics for a short link, and a silent
  // default that produces no error if forgotten.
  const redirectResponse = NextResponse.redirect(result.destination, { status: 302 });
  // Without this, a CDN or browser can cache the redirect and future visits
  // never reach us again — the same failure mode as a 301, through a
  // different door.
  redirectResponse.headers.set("Cache-Control", "no-store");
  return redirectResponse;
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Case-sensitive throughout: the Step 8 alphabet includes both cases, so
  // "JzjykHi" and "jzjykhi" are different links. Never lowercased here.
  const slug = request.nextUrl.pathname.slice(1);
  const cacheKey = `${LINK_CACHE_PREFIX}${slug}`;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Gates before the cache lookup, not after — a flood of requests for one
  // IP shouldn't get to spend Redis/Postgres capacity just because they'd
  // all be cheap cache hits individually.
  const rateLimitResult = await redirectLimit.limit(ip);
  if (!rateLimitResult.success) {
    return new NextResponse("Too many requests. Please slow down and try again shortly.", {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds(rateLimitResult.reset)),
        "Content-Type": "text/plain",
      },
    });
  }

  // Cache-first: a warm slug completes the redirect with zero database
  // queries — this is the entire point of Phase 3.
  const cached = await redis.get<ResolveResult>(cacheKey);
  let result: ResolveResult;
  if (cached) {
    result = cached;
  } else {
    // Cache miss: fall back to the resolve endpoint, which queries Postgres
    // and populates the cache (both positive and negative) for next time.
    // A relative fetch has no base URL in this runtime — build an absolute
    // one from the incoming request's own origin.
    const resolveUrl = new URL("/api/internal/resolve", request.nextUrl.origin);
    const response = await fetch(resolveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    result = await response.json();
  }

  // The redirect response is built first — tracking is dispatched after,
  // via waitUntil, so a slow or failing write can never delay or break the
  // visitor's redirect. Not in this step: no Redis for tracking itself, no
  // separate queue — just a fire-and-forget POST.
  const redirectResponse = buildResponse(result, request.nextUrl.origin);

  if (result.found && result.isActive && !isLinkExpired(result)) {
    const { device, os, browser } = parseUserAgent(request.headers.get("user-agent") ?? "");
    const trackUrl = new URL("/api/internal/track", request.nextUrl.origin);
    event.waitUntil(
      fetch(trackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          ipHash: hashIp(ip),
          ...getGeo(request.headers),
          device,
          os,
          browser,
          referrer: normalizeReferrer(request.headers.get("referer")),
        }),
      }),
    );
  }

  return redirectResponse;
}

export const config = {
  // Matches exactly one path segment with no dot (so static files with an
  // extension are already excluded structurally) and no slash (so anything
  // under /dashboard/*, /api/*, etc. is already excluded too — the lookahead
  // only needs to catch the bare, single-segment names themselves).
  // /api must be excluded here, not just relied on elsewhere: if this
  // matcher ever caught /api/internal/resolve, the fetch above would
  // re-enter this proxy and recurse.
  matcher: ["/((?!api$|_next$|dashboard$|login$|expired$)[^/.]+)"],
};
