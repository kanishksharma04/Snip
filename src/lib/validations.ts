import { z } from "zod";
import { isReserved } from "@/lib/slug";

function getSnipBaseUrl(): string {
  const value = process.env.SNIP_BASE_URL;
  if (!value) {
    throw new Error("SNIP_BASE_URL is not set");
  }
  return value;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function inCidrRange(ip: number, base: string, maskBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

// The AWS/GCP/Azure metadata endpoint (169.254.169.254) lives in the
// link-local range — reachability from server-rendered redirect logic is the
// canonical SSRF-to-credential-theft path, which is why that range matters
// most among these four.
function isPrivateIPv4(ip: string): boolean {
  const int = ipv4ToInt(ip);
  if (int === null) return false;
  return (
    inCidrRange(int, "10.0.0.0", 8) ||
    inCidrRange(int, "172.16.0.0", 12) ||
    inCidrRange(int, "192.168.0.0", 16) ||
    inCidrRange(int, "169.254.0.0", 16) ||
    inCidrRange(int, "127.0.0.0", 8)
  );
}

// IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are how an attacker reaches the
// same private IPv4 space through an IPv6 literal. `new URL()` normalizes
// these to compressed hex groups (e.g. "[::ffff:7f00:1]" for 127.0.0.1), so
// the dotted-decimal check above never sees them unless we decode this form
// first.
function extractIPv4MappedAddress(bracketedHostname: string): string | null {
  const stripped = bracketedHostname.replace(/^\[|\]$/g, "").toLowerCase();
  const match = stripped.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  const highGroup = match?.[1];
  const lowGroup = match?.[2];
  if (!highGroup || !lowGroup) return null;
  const high = parseInt(highGroup, 16);
  const low = parseInt(lowGroup, 16);
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  // Attack: SSRF against the app's own host / the loopback interface.
  if (normalized === "localhost") return true;
  if (normalized === "0.0.0.0") return true;
  if (normalized === "[::1]" || normalized === "::1") return true;

  if (isPrivateIPv4(normalized)) return true;

  const mapped = extractIPv4MappedAddress(normalized);
  if (mapped && isPrivateIPv4(mapped)) return true;

  return false;
}

export const destinationSchema = z
  .string()
  // Attack: unbounded input used as a DoS/storage vector, and a floor under
  // which the checks below stay cheap to run on every create/redirect.
  .max(2048, "Destination URL is too long")
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      // Attack: malformed input reaching a redirect response unvalidated.
      ctx.addIssue({ code: "custom", message: "Must be a valid URL" });
      return;
    }

    // Attack: javascript:/data:/vbscript: URIs execute arbitrary script in
    // the visitor's browser once we redirect to them; file: reads the
    // visitor's local filesystem. Checking `.protocol` after parsing (not
    // regexing the raw string) is what makes this unbypassable — a payload
    // like "javascript:alert(1)//https://x.com" still parses with
    // protocol "javascript:", regardless of what text follows it.
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "Only http and https URLs are allowed",
      });
      return;
    }

    // Attack: redirect loop — a link whose destination is Snip itself.
    // Matched on hostname (not substring) so "snip-blush.vercel.app.evil.com"
    // doesn't slip through a naive .includes() check.
    const baseHostname = new URL(getSnipBaseUrl()).hostname.toLowerCase();
    if (url.hostname.toLowerCase() === baseHostname) {
      ctx.addIssue({
        code: "custom",
        message: "Destination cannot point back to Snip",
      });
      return;
    }

    // Attack: SSRF — see isBlockedHostname for the specific targets and why
    // each one is dangerous (loopback, private ranges, cloud metadata IP).
    //
    // Decimal/hex/octal IPv4 obfuscation (e.g. http://2130706433/ or
    // http://0x7f000001/, both meaning 127.0.0.1) is handled for free here:
    // `new URL()` implements the WHATWG host-parsing algorithm, which
    // normalizes every one of those forms to dotted-decimal in `.hostname`
    // before we ever see it — verified directly, not assumed. We deliberately
    // check the parsed `.hostname`, never the raw input string.
    if (isBlockedHostname(url.hostname)) {
      ctx.addIssue({
        code: "custom",
        message: "Destination cannot target a local or private network address",
      });
    }

    // NOT handled: DNS rebinding — a hostname that resolves to a public IP
    // now can be repointed at a private IP by the time it's actually used.
    // This is validation at write time, not fetch time, so it can't close
    // that gap by itself. Accepted here because Snip never fetches the
    // destination server-side; it only sends the visitor's browser a 302,
    // so there's no server process making a request an attacker could
    // redirect onto an internal address. If a future step ever fetches a
    // destination server-side (link previews, safe-browsing checks, etc.),
    // this reasoning stops applying and rebinding needs its own defense at
    // that call site.
  });

export const customSlugSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]{3,32}$/,
    "Slug must be 3-32 characters: letters, numbers, underscores, hyphens",
  )
  // Attack: a custom slug that shadows a reserved application route
  // (e.g. /dashboard, /login) — imported from Step 8 rather than
  // duplicating the list, so the two can't drift apart.
  .refine((slug) => !isReserved(slug), "This slug is reserved");
