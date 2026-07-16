import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type TrackBody = {
  slug: string;
  ipHash: string;
  country: string | null;
  city: string | null;
  region: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  referrer: string;
};

function isTrackBody(value: unknown): value is TrackBody {
  return !!value && typeof value === "object" && typeof (value as TrackBody).slug === "string";
}

// Called via event.waitUntil() from proxy.ts, fired after the redirect
// response is already constructed — a slow or failing write here can never
// delay or break the visitor's redirect. All parsing (UA/geo/IP-hashing)
// already happened in proxy.ts; this endpoint only writes.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isTrackBody(body)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const link = await db.link.findUnique({
    where: { slug: body.slug },
    select: { id: true },
  });
  if (!link) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await db.$transaction([
    db.link.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    }),
    db.clickEvent.create({
      data: {
        linkId: link.id,
        ipHash: body.ipHash,
        country: body.country,
        city: body.city,
        region: body.region,
        device: body.device,
        os: body.os,
        browser: body.browser,
        referrer: body.referrer,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
