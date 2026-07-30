// Same reasoning as the hashed IPs (src/lib/analytics.ts hashIp): don't
// retain what isn't needed. An error message or stack trace can end up
// echoing a raw URL from anywhere in the request path — most notably a
// link's destination, which can carry tokens or PII in its query string
// (e.g. a password-reset link). This strips the query string and hash off
// every URL-shaped substring found in a piece of text, keeping only the
// origin and pathname, before it's ever written to a log.
const URL_PATTERN = /https?:\/\/[^\s"']+/g;

export function redactUrls(input: string): string {
  return input.replace(URL_PATTERN, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return "[unparseable-url]";
    }
  });
}
