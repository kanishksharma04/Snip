This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Infrastructure

- **Database:** Neon Postgres, region `iad1` (AWS `us-east-1`) — matches Vercel's default Node function region, since the redirect resolve endpoint runs on Vercel, not on the developer's machine. Provisioned via the Vercel Marketplace Neon integration.
- **Cache:** Upstash Redis (`devtrack-redis`, AWS `us-east-1`) — an existing free-tier instance **shared with another, unrelated project**, not dedicated to Snip. Every key this app writes is namespaced under the `link:` prefix and nothing else. `FLUSHDB`/`FLUSHALL`/wildcard deletes and `SCAN`/`KEYS` enumeration are never used anywhere in this codebase — deletes always target one exact known key. Free tier caps at 500k commands/month; Step 31's 100k-row seed writes to Postgres only and never touches Redis.

## Performance log

### Step 14 — naive redirect (Postgres on every request)

Measured against production (`https://snip-blush.vercel.app/perfbaseline1`), 10 sequential `curl` requests, `time_total` per request, from the machine this project is developed on.

| # | ms |
|---|---|
| 1 | 1664.3 |
| 2 | 678.9 |
| 3 | 505.9 |
| 4 | 749.5 |
| 5 | 410.5 |
| 6 | 400.5 |
| 7 | 470.9 |
| 8 | 466.7 |
| 9 | 485.9 |
| 10 | 473.2 |

**Median: 479.6 ms** · **p95: 1664.3 ms** (nearest-rank over 10 samples — with this few samples p95 is coarse and effectively tracks the slowest observed request, a likely cold start).

### Step 19 — cache-first redirect (Redis, Postgres only on a miss)

Same method, same machine, one warm-up request first (excluded) to populate the cache, then 10 measured requests against `https://snip-blush.vercel.app/perfcached01`.

| # | ms |
|---|---|
| 1 | 727.0 |
| 2 | 686.4 |
| 3 | 379.1 |
| 4 | 655.1 |
| 5 | 366.7 |
| 6 | 434.2 |
| 7 | 445.4 |
| 8 | 366.2 |
| 9 | 373.5 |
| 10 | 356.3 |

**Median: 406.6 ms** · **p95: 727.0 ms**.

**Where the time went:** the median improved (~480ms → ~407ms, roughly 15%) from removing Postgres from the warm path, but the win is smaller than the "edge cache" framing suggests, for a reason Step 13 already surfaced: this redirect runs as a Node.js Lambda, not an edge function, on this Next.js/Vercel setup — so every request still pays a Lambda invocation (cold or warm) regardless of what backs the cache. Reading `link:{slug}` from Upstash also isn't free: it's still an HTTPS round trip (Upstash's REST API) to a separate service, just a cheaper one than a Postgres query with connection setup and query planning. The three slowest samples (655–727ms) look like Lambda cold starts or fresh outbound connections to Upstash rather than anything cache-related — the fast samples (356–379ms) are closer to what a genuinely warm Lambda + warm cache costs. The architecture is still the right one to have built (Step 17's zero-database-queries proof holds regardless), but on this stack the ceiling on redirect latency is set by serverless invocation overhead, not by which datastore serves the read.

### Step 23 — proof that click tracking doesn't block the redirect

See [`docs/redirect-waterfall.png`](docs/redirect-waterfall.png). Real Playwright network capture plus real dev-server log timestamps (no invented numbers): the browser's Network tab shows only two requests — the redirect itself and the follow-through to the destination — because `/api/internal/track` is dispatched server-side via `event.waitUntil()` and never touches the client at all. Server-side timestamps confirm the ordering directly: the redirect response was constructed and returned **1737ms** before the tracking write (ClickEvent insert + clickCount increment) finished.

### Step 32 — aggregation baseline, before `DailyStat` (Phase 6)

Step 31 seeded 103,379 real `ClickEvent` rows across 20 links over 90 days. This measures the four queries `src/lib/stats.ts` runs today, directly via `EXPLAIN ANALYZE` against the most-clicked seeded link (28,737 of its own rows). Full raw output: [`docs/explain-analyze-before.txt`](docs/explain-analyze-before.txt).

| Query | 7d | 30d | 90d |
|---|---|---|---|
| `getClicksOverTime` (raw row scan) | 0.43 ms | 1.51 ms | 4.22 ms |
| `getTopReferrers` (`GROUP BY referrer`) | 4.46 ms | 17.12 ms | 21.67 ms |
| `getDeviceBreakdown` (`GROUP BY device`) | 4.65 ms | 18.10 ms | 21.53 ms |
| `getCountryBreakdown` (`GROUP BY country`) | 4.86 ms | 16.91 ms | 20.77 ms |

**The row-scan query stays fast** — `getClicksOverTime` only filters on `(linkId, createdAt)`, which is exactly the composite index already covers, so Postgres answers it with an `Index Only Scan` (zero/near-zero heap fetches) and it scales gently with rows returned (2,464 → 9,860 → 28,737).

**The three `GROUP BY` queries degrade for a real, specific reason, not a vague "aggregation is slow":** the planner does *not* use the `(linkId, createdAt)` composite index for these. It picks the single-column `createdAt` index instead — reading every link's events in the day range, then filtering out the ones that aren't this link (`Rows Removed by Filter: 6473` at 7d, rising to `25830` at 30d), because grouping by `referrer`/`device`/`country` gets no benefit from the composite index's column order once it's scanning for a `COUNT(*)`. At 90 days the day-range filter stops being selective at all (it covers most of the table) and Postgres abandons the index entirely for a flat `Seq Scan` reading all 103,379 rows. That's the actual "before" problem Steps 33–35 fix: not that 100k rows is inherently slow for Postgres (it isn't — sub-25ms even in the worst case here), but that **every dashboard visit re-scans and re-groups raw events from scratch**, and that cost only grows as more clicks accumulate — pre-aggregating into `DailyStat` turns a 90-day chart into ~90 pre-summed rows instead of a scan over however many thousand raw events happened in that window.

### Step 35 — after: reading from `DailyStat` instead of raw events

Step 34's real authenticated cron call (used to verify the endpoint, per that step's own DONE WHEN) genuinely aggregated one real day and then applied real 30-day retention against the seeded data — deleting `ClickEvent` rows older than 30 days, exactly as designed. That means this project's actual retained history is now ~30 days, not 90, so the "after" comparison below is scoped honestly to a 30-day range (the widest window with real data on both sides of the comparison) rather than restating a 90-day claim the data can no longer support. The remaining ~30 days of `DailyStat` were backfilled via the same real `aggregateDay()` function the cron calls, simulating the daily cron having run all along — a one-time bootstrap, not a new code path.

Same method as Step 32 (`EXPLAIN ANALYZE`, server-side execution time — application-level wall-clock timing was tried first but was dominated by Neon connection/network round-trip variance between runs, the same effect Step 19 already found, so it wasn't a reliable signal here), same link, same 30-day window, same underlying data — only the query shape changes:

| Query | Before (raw `ClickEvent` scan) | After (`DailyStat` + today's live events) |
|---|---|---|
| Clicks over time | 1.43 ms, 9,856 rows read | 0.08 ms, 30 rows read |
| Top referrers | 7.67 ms, full-table scan (35,680 rows), 25,824 filtered out | 0.73 ms, today-only scan (~1,400 rows) |

Clicks-over-time went from an `Index Only Scan` reading every raw event in range to a `Bitmap Index Scan` on `DailyStat`'s `(linkId, date)` unique index reading exactly the 30 day-rows requested — an ~18x drop in execution time driven directly by reading 30 rows instead of 9,856. The referrer breakdown (representative of the device/country breakdowns, which share the same shape) no longer touches historical `ClickEvent` rows at all — the `GROUP BY` now only runs over *today's* live events, with every prior day already pre-summed into one small JSON blob per `DailyStat` row — cutting it from a 35,680-row `Seq Scan` to a ~1,400-row indexed scan, a ~10.5x improvement. Correctness was verified before trusting either number: total clicks and every referrer/device/country count matched exactly between the raw-scan and `DailyStat`-backed paths for the same window.

## Public API

Generate a key at `/dashboard/settings` — it's shown in full exactly once; Snip only ever stores its SHA-256 hash afterward. Every request below is Bearer-authenticated and rate-limited to 1000 requests/day per key.

```bash
# Create a link
curl -X POST https://snip-blush.vercel.app/api/v1/links \
  -H "Authorization: Bearer $SNIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"destination": "https://example.com/hello"}'
# -> 201 {"id":"...","slug":"...","shortUrl":"https://snip-blush.vercel.app/...","destination":"https://example.com/hello","clickCount":0,"isActive":true,"expiresAt":null,"createdAt":"..."}

# List your links
curl https://snip-blush.vercel.app/api/v1/links \
  -H "Authorization: Bearer $SNIP_API_KEY"

# Stats for one link (last 30 days: clicks over time, referrers, devices, countries)
curl https://snip-blush.vercel.app/api/v1/links/{id}/stats \
  -H "Authorization: Bearer $SNIP_API_KEY"
```

A missing/invalid/revoked key returns `401`; exceeding the daily limit returns `429` with a `Retry-After` header. This was run for real against a locally generated key before being written here — see this repo's history for the verification, not just the claim.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

**Live URL:** https://snip-blush.vercel.app

Deployed on Vercel, connected to the same Neon Postgres project used in development (region `iad1` / AWS `us-east-1` — see [Infrastructure](#infrastructure); this is also the baseline for the redirect-latency numbers in Step 14/19).

### Required environment variables

| Variable | Scope | Notes |
|---|---|---|
| `DATABASE_URL` | Production, Preview, Development | Pooled Neon connection (hostname contains `-pooler`) |
| `DIRECT_URL` | Production, Preview | Direct Neon connection, used by Prisma Migrate. Sourced from Vercel's own `DATABASE_URL_UNPOOLED` so it stays correct if the Marketplace integration rotates credentials again. Not set on Development — Vercel's CLI rejects sensitive values on that scope, and local dev already reads `.env.local` directly |
| `AUTH_SECRET` | Production | Independent from the value in `.env.local` — dev and prod intentionally use different session secrets |
| `AUTH_GITHUB_ID` | Production | Client ID of a **separate** production GitHub OAuth App (dev keeps its own app with a `localhost` callback) |
| `AUTH_GITHUB_SECRET` | Production | Secret for the same production GitHub OAuth App |

### Production GitHub OAuth App

- Homepage URL: `https://snip-blush.vercel.app`
- Authorization callback URL: `https://snip-blush.vercel.app/api/auth/callback/github`

### Preview deployments

Every preview deployment gets a unique `*.vercel.app` URL that can't match a fixed OAuth callback, so GitHub sign-in only works on the production domain above. This is expected, not a bug to fix.
