import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSnipBaseUrl } from "@/lib/validations";
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
    select: { slug: true },
  });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shortUrl = `${getSnipBaseUrl()}/${link.slug}`;
  const png = await generateQrPng(shortUrl);

  // "inline", not "attachment": this same response backs both the <img> tag
  // shown on the detail page and the download link (which forces a save via
  // its own `download` attribute) — attachment would fight the <img> render
  // in some browsers.
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${link.slug}-qr.png"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
