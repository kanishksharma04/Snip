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
