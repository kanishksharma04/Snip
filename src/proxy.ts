import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// HARD CONSTRAINT: this file must never import Prisma or anything that
// transitively imports it (e.g. @/lib/db, @/lib/actions/*). On this Next.js
// version (16) "Middleware" was renamed to "Proxy", and this project's real
// deployment confirms it now runs as a plain Node.js Lambda, not the edge
// runtime the older docs describe — verified directly via `vercel inspect`
// on a real deployment (lambda.runtime: "nodejs24.x", edge: null). A direct
// Prisma import here would in fact work today. We keep this split anyway:
// the redirect path fetches a separate Node-runtime route handler instead of
// querying Postgres inline, on purpose, to preserve the architecture Phase 3
// is built to teach (cache-first redirects, Step 17) rather than because the
// runtime forces it. Naive today, deliberately — Step 14 measures this
// version, Step 17 replaces the Postgres call with Redis.
type ResolveResult =
  | { found: true; destination: string; isActive: boolean; expiresAt: string | null }
  | { found: false };

export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.slice(1);

  // A relative fetch has no base URL in this runtime — build an absolute
  // one from the incoming request's own origin.
  const resolveUrl = new URL("/api/internal/resolve", request.nextUrl.origin);

  const response = await fetch(resolveUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Case-sensitive: slug is passed through exactly as received, never
    // lowercased (that's isReserved's concern, not this one).
    body: JSON.stringify({ slug }),
  });

  if (response.status === 404) {
    // Let Next.js render its own not-found page rather than rewriting to a
    // custom route — there's no extra content to show beyond "not found",
    // and NextResponse.next() means one less route to maintain for a result
    // that's already exactly what Next's built-in 404 provides.
    return NextResponse.next();
  }

  const result: ResolveResult = await response.json();

  if (!result.found) {
    return NextResponse.next();
  }

  const isExpired = result.expiresAt !== null && new Date(result.expiresAt) <= new Date();

  if (!result.isActive || isExpired) {
    return NextResponse.redirect(new URL("/expired", request.nextUrl.origin), {
      status: 302,
    });
  }

  // 302, explicit: NextResponse.redirect() defaults to 307, which preserves
  // the request method — wrong semantics for a short link, and a silent
  // default that produces no error if forgotten.
  const redirectResponse = NextResponse.redirect(result.destination, {
    status: 302,
  });
  // Without this, a CDN or browser can cache the redirect and future visits
  // never reach us again — the same failure mode as a 301, through a
  // different door.
  redirectResponse.headers.set("Cache-Control", "no-store");
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
