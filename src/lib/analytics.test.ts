import { describe, expect, it } from "vitest";
import { getGeo, normalizeReferrer, parseUserAgent } from "@/lib/analytics";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const TABLET_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("parseUserAgent", () => {
  it("classifies a desktop user agent", () => {
    const result = parseUserAgent(DESKTOP_UA);
    expect(result.device).toBe("desktop");
    expect(result.os).toBe("Windows");
    expect(result.browser).toBe("Chrome");
  });

  it("classifies a mobile user agent", () => {
    const result = parseUserAgent(MOBILE_UA);
    expect(result.device).toBe("mobile");
    expect(result.os).toBe("iOS");
  });

  it("classifies a tablet user agent", () => {
    const result = parseUserAgent(TABLET_UA);
    expect(result.device).toBe("tablet");
    expect(result.os).toBe("iOS");
  });

  it("classifies a bot user agent, not as desktop", () => {
    const result = parseUserAgent(BOT_UA);
    expect(result.device).toBe("bot");
    expect(result.os).toBeNull();
    expect(result.browser).toBeNull();
  });
});

describe("getGeo", () => {
  it("reads country, city, and region from Vercel's headers", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "US",
      "x-vercel-ip-city": "San%20Francisco",
      "x-vercel-ip-country-region": "CA",
    });
    expect(getGeo(headers)).toEqual({
      country: "US",
      city: "San Francisco",
      region: "CA",
    });
  });

  it("returns nulls when headers are absent", () => {
    expect(getGeo(new Headers())).toEqual({ country: null, city: null, region: null });
  });
});

describe("normalizeReferrer", () => {
  it("reduces a full URL to a bare hostname", () => {
    expect(normalizeReferrer("https://www.google.com/search?q=snip")).toBe("www.google.com");
  });

  it("returns 'direct' for null", () => {
    expect(normalizeReferrer(null)).toBe("direct");
  });

  it("returns 'direct' for an unparseable value", () => {
    expect(normalizeReferrer("not a url")).toBe("direct");
  });
});
