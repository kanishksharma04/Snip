This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Infrastructure

- **Database:** Neon Postgres, region `iad1` (AWS `us-east-1`) — matches Vercel's default Node function region, since the redirect resolve endpoint runs on Vercel, not on the developer's machine. Provisioned via the Vercel Marketplace Neon integration.

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
