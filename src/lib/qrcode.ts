import QRCode from "qrcode";

export async function generateQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: "png", width: 512, margin: 2 });
}
