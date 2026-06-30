import { NextRequest } from "next/server";
import QRCode from "qrcode";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const value = url.searchParams.get("url");

  if (!value || value.length > 2048) {
    return new Response("Missing url", { status: 400 });
  }

  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    width: 220,
    errorCorrectionLevel: "M",
  });

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
