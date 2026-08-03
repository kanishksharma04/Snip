import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

// This Redis instance is shared with another, unrelated project (see
// README's Infrastructure section) — every key Snip writes must be
// namespaced under "link:" and nothing else. @upstash/ratelimit defaults to
// its own "@upstash/ratelimit" prefix, which would violate that constraint,
// so every limiter below sets an explicit "link:ratelimit:*" prefix instead.

// Anonymous demo link creation (wired in once Step 39 builds it).
export const anonymousLinkCreationLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "link:ratelimit:anon-create",
});

// Authenticated link creation — keyed by organizationId (an org-wide cap
// shared by all its members, not a per-person one), applied in createLink().
export const authenticatedLinkCreationLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  prefix: "link:ratelimit:auth-create",
});

// Public API (wired in once Step 38 builds /api/v1/*), keyed by API key id.
export const apiLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1000, "1 d"),
  prefix: "link:ratelimit:api",
});

// Redirects — keyed by IP, applied in proxy.ts ahead of the cache lookup.
export const redirectLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "link:ratelimit:redirect",
});

export type RateLimitOutcome = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

// Seconds until `reset` (an epoch ms timestamp), floored at 1 — the value
// this app puts in a Retry-After header, which must be a positive integer.
export function retryAfterSeconds(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}
