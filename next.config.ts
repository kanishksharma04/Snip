import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.join(import.meta.dirname ?? process.cwd());

// 'unsafe-inline' on script-src/style-src, not a nonce-based policy: Next.js
// injects inline hydration/RSC-payload scripts and next-themes injects an
// inline FOUC-prevention script on every page, and Radix's positioning logic
// sets inline style="" attributes on portalled content (dropdowns, dialogs,
// popovers) — a strict nonce policy would need per-request nonce generation
// threaded through proxy.ts, which that file's own hard constraint (no
// Prisma, minimal logic, redirect hot path only) argues against taking on
// here. This is still real hardening over no CSP at all: it blocks loading
// any THIRD-PARTY script/style origin outright, which is the actual XSS
// payload delivery vector this is meant to close off.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // GitHub avatars (next-auth's GitHub provider): rendered via a plain <img>
  // (Radix's Avatar.Image), not next/image, so it isn't proxied same-origin.
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // An unrelated package-lock.json in the parent home directory makes Next.js
  // misdetect the workspace root; pin it explicitly to this project.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        // Every route, not just pages: harmless on JSON API responses, and
        // catching every path here is simpler and more robust than trying to
        // enumerate exactly which routes render HTML.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
