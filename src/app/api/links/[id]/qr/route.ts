import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { buildShortUrl } from "@/lib/validations";
import { generateQrPng } from "@/lib/qrcode";

export const runtime = "nodejs";

// Same ownership-scoped lookup as the detail page: a link that exists but
// belongs to someone else 404s exactly like one that doesn't exist, so this
// endpoint can't be used to probe which link IDs are real.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const link = await db.link.findFirst({
    where: { id, userId },
    select: { slug: true, domain: { select: { hostname: true } } },
  });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The PNG is a pure function of the slug (there's no rename-slug action —
  // it's fixed for the link's lifetime), its assigned domain (also fixed at
  // creation — no reassign-domain action either), and SNIP_BASE_URL (fixed
  // per deployment), so it's genuinely immutable for this URL, not just
  // slow-changing. slug + domain double as the ETag: they change if and
  // only if the image content would.
  const etag = `"qr-${link.slug}-${link.domain?.hostname ?? "default"}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const shortUrl = buildShortUrl(link);
  const png = await generateQrPng(shortUrl);

  // "inline", not "attachment": this same response backs both the <img> tag
  // shown on the detail page and the download link (which forces a save via
  // its own `download` attribute) — attachment would fight the <img> render
  // in some browsers. "private" (not public): this is still behind the
  // ownership check above, so it must never be cached by a shared/CDN
  // cache — only the requesting browser's own cache. "immutable" tells the
  // browser not to even bother revalidating for the full year; the ETag is
  // there for the rarer case (hard refresh, explicit revalidation) where it
  // does anyway, so that still skips PNG regeneration.
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${link.slug}-qr.png"`,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: etag,
    },
  });
}
