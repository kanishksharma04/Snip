import { UAParser } from "ua-parser-js";

export type ParsedUserAgent = {
  device: "desktop" | "mobile" | "tablet" | "bot";
  os: string | null;
  browser: string | null;
};

// ua-parser-js has no built-in "is this a bot" flag in getResult() — a
// crawler's device/browser/os all come back empty, which would otherwise be
// misclassified as "desktop". Checked before parsing so a bot UA never
// reaches UAParser at all.
const BOT_PATTERN = /bot|spider|crawl|slurp|bingpreview|facebookexternalhit/i;

export function parseUserAgent(userAgent: string): ParsedUserAgent {
  if (BOT_PATTERN.test(userAgent)) {
    return { device: "bot", os: null, browser: null };
  }

  const result = new UAParser(userAgent).getResult();
  const deviceType = result.device.type;

  return {
    device: deviceType === "mobile" || deviceType === "tablet" ? deviceType : "desktop",
    os: result.os.name ?? null,
    browser: result.browser.name ?? null,
  };
}

export type Geo = {
  country: string | null;
  city: string | null;
  region: string | null;
};

// Vercel's actual header is x-vercel-ip-country-region, not
// x-vercel-ip-region — verified against Vercel's own docs rather than
// assumed. City names are RFC3986-encoded for non-ASCII characters, so they
// need decoding.
export function getGeo(headers: Headers): Geo {
  const city = headers.get("x-vercel-ip-city");
  return {
    country: headers.get("x-vercel-ip-country"),
    city: city ? decodeURIComponent(city) : null,
    region: headers.get("x-vercel-ip-country-region"),
  };
}

export function normalizeReferrer(referrer: string | null): string {
  if (!referrer) return "direct";
  try {
    return new URL(referrer).hostname;
  } catch {
    return "direct";
  }
}
