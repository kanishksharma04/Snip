import Image from "next/image";

export function QrCode({ linkId, slug }: { linkId: string; slug: string }) {
  const qrUrl = `/api/links/${linkId}/qr`;

  return (
    <div className="flex items-center gap-3">
      <Image
        src={qrUrl}
        alt={`QR code for ${slug}`}
        width={96}
        height={96}
        unoptimized
        className="rounded border"
      />
      {/* Same URL as the image above — `download` forces a save regardless
          of the response's Content-Disposition, so one endpoint serves both
          the inline preview and the downloadable file. */}
      <a href={qrUrl} download={`${slug}-qr.png`} className="text-primary text-sm underline">
        Download QR (PNG)
      </a>
    </div>
  );
}
