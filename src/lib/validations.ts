import { z } from "zod";
import { isReserved } from "@/lib/slug";

export function getSnipBaseUrl(): string {
  const value = process.env.SNIP_BASE_URL;
  if (!value) {
    throw new Error("SNIP_BASE_URL is not set");
  }
  return value;
}

// SNIP_BASE_URL is server-only (not NEXT_PUBLIC_-prefixed) — it's never
// inlined into the client bundle. destinationSchema is shared into a Client
// Component's zodResolver (Step 11's formSchema), so its own-domain check
// below must tolerate running somewhere this env var doesn't exist, without
// throwing an unhandled rejection out of form validation. This does not
// weaken enforcement: createLink() always re-validates with the same
// destinationSchema server-side, where SNIP_BASE_URL is guaranteed to
// exist — that's the real boundary, this is best-effort UX only.
function getSnipBaseUrlSafe(): string | null {
  try {
    return getSnipBaseUrl();
  } catch {
    return null;
  }
}

// Every short URL in the app is built through this one function — a link
// with a verified custom domain attached is served from that hostname,
// everything else falls back to SNIP_BASE_URL exactly as before this
// feature existed.
export function buildShortUrl(link: { slug: string; domain?: { hostname: string } | null }): string {
  const base = link.domain ? `https://${link.domain.hostname}` : getSnipBaseUrl();
  return `${base}/${link.slug}`;
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
    // doesn't slip through a naive .includes() check. Uses the safe getter:
    // in a browser bundle SNIP_BASE_URL is unavailable and this check is
    // simply skipped there (see getSnipBaseUrlSafe's comment) — the server
    // always re-runs this exact check where the value is guaranteed.
    const baseUrl = getSnipBaseUrlSafe();
    const baseHostname = baseUrl ? new URL(baseUrl).hostname.toLowerCase() : null;
    if (baseHostname && url.hostname.toLowerCase() === baseHostname) {
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

const HOSTNAME_LABEL = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)$/;

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253, "Domain is too long")
  .refine((value) => {
    const labels = value.split(".");
    return labels.length >= 2 && labels.every((label) => HOSTNAME_LABEL.test(label));
  }, "Must be a valid domain name, e.g. go.example.com")
  // Attack surface avoided, not attacked: an IP-literal "hostname" can never
  // be proven via DNS TXT the way a real domain can, so it's rejected here
  // rather than accepted and left permanently unverifiable.
  .refine((value) => ipv4ToInt(value) === null, "Must be a domain name, not an IP address")
  .refine((value) => {
    const baseUrl = getSnipBaseUrlSafe();
    const baseHostname = baseUrl ? new URL(baseUrl).hostname.toLowerCase() : null;
    return value !== baseHostname;
  }, "This is already Snip's default domain");

// An untouched optional <input> in a React Hook Form submits "", not
// undefined. "" would fail customSlugSchema's {3,32} length check even
// though the user never touched the field — so both optional form fields
// convert "" to undefined before the real schema ever sees it.
//
// Deliberately `.transform().pipe()`, not `z.preprocess()`: preprocess types
// its input as `unknown` (it accepts anything before transforming), which
// would make z.input<typeof formSchema> collapse these fields to `unknown`
// and break binding them to plain <input> elements. transform().pipe()
// keeps the input type as the wrapped schema's own input (string).
const emptyStringToUndefined = (value: string) => (value === "" ? undefined : value);

// Snip currently assumes its users are in IST (+05:30) rather than doing
// per-user timezone detection. <input type="datetime-local"> yields a naive
// "YYYY-MM-DDTHH:mm" string with no timezone attached. Relying on
// `new Date(value)`'s implicit "local timezone of whatever runs this code"
// would be correct in an IST browser but wrong on a server whose runtime
// timezone isn't IST (Vercel's Node functions run in UTC), and it would make
// this function's behavior depend on the test runner's system timezone
// rather than being deterministic. This instead treats the string as IST
// wall-clock time explicitly, everywhere it runs.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export function parseIstDatetimeLocal(value: string): Date {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  const utcMillis =
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0) -
    IST_OFFSET_MINUTES * 60_000;
  return new Date(utcMillis);
}

export const formSchema = z.object({
  destination: destinationSchema,
  customSlug: z
    .string()
    .transform(emptyStringToUndefined)
    .pipe(customSlugSchema.optional()),
  expiresAt: z
    .string()
    .transform(emptyStringToUndefined)
    .pipe(z.string().optional())
    .transform((value) => (value ? parseIstDatetimeLocal(value) : undefined)),
  // Optional at the key level too (unlike customSlug/expiresAt above) so
  // callers that never touch this field — e.g. this file's own pre-existing
  // tests — can omit it entirely, not just pass "". "" means "no domain
  // selected" (the default-domain <Select> item), same empty-string
  // convention as the other fields.
  domainId: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type FormInput = z.input<typeof formSchema>;
export type FormOutput = z.output<typeof formSchema>;
