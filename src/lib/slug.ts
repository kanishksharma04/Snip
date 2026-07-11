import { customAlphabet } from "nanoid";

// Base62 (0-9, A-Z, a-z) minus the visually ambiguous characters 0 O I l 1 —
// 57 characters. At length 7 the keyspace is 57^7 = 1,954,897,493,193
// (~1.95 trillion). Even with 1,000,000 existing links, the probability a
// freshly generated slug collides with one of them is
// 1,000,000 / 1,954,897,493,193 ≈ 5.12e-7 — about 1 in 1.95 million. That's
// why Step 10's plain retry-on-collision strategy is enough on its own.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;

const nanoid = customAlphabet(ALPHABET, SLUG_LENGTH);

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api",
  "dashboard",
  "login",
  "logout",
  "admin",
  "settings",
  "new",
  "expired",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export function isReserved(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function generateSlug(): string {
  let slug = nanoid();
  // "expired" is exactly 7 characters and every letter is in our alphabet,
  // so generateSlug() can in principle emit it (or another reserved word).
  // The odds are negligible but shipping a link that silently collides with
  // a reserved route isn't a probability question — re-roll instead.
  while (isReserved(slug)) {
    slug = nanoid();
  }
  return slug;
}
