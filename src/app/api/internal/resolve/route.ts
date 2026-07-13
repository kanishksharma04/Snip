import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Node runtime (the default for route handlers) — this is the only place in
// the redirect path allowed to import Prisma. proxy.ts calls this over fetch
// instead of querying Postgres directly, keeping the redirect path's shape
// as if it were edge-constrained (it verifiably isn't, on this Next.js
// version/Vercel setup — see Step 13's commit message for why we're keeping
// this split anyway). Step 17 replaces this Postgres call with a Redis
// lookup for a real performance win, independent of that runtime question.
export const runtime = "nodejs";

// KNOWN GAP: this endpoint is publicly reachable right now — anyone can POST
// an arbitrary slug and learn whether it exists, its destination, and its
// active/expiry state, without going through the redirect. Step 16 revisits
// this (shared-secret header) when this endpoint starts writing to Redis;
// not addressed here on purpose.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const slug =
    body && typeof body === "object" && "slug" in body ? body.slug : null;

  if (typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json({ found: false }, { status: 400 });
  }

  // Case-sensitive lookup — the Step 8 alphabet includes both cases, so
  // "JzjykHi" and "jzjykhi" are different links. No .toLowerCase() here.
  const link = await db.link.findUnique({
    where: { slug },
    select: { destination: true, isActive: true, expiresAt: true },
  });

  if (!link) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({ found: true, ...link });
}
