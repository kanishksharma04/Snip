import { describe, expect, it } from "vitest";
import { generateSlug, isReserved } from "@/lib/slug";

describe("generateSlug", () => {
  const slugs = Array.from({ length: 10_000 }, () => generateSlug());

  it("contains zero ambiguous characters (0 O I l 1)", () => {
    for (const slug of slugs) {
      expect(slug).not.toMatch(/[0OIl1]/);
    }
  });

  it("produces all distinct slugs", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("is always exactly 7 characters long", () => {
    for (const slug of slugs) {
      expect(slug).toHaveLength(7);
    }
  });

  it("never generates a reserved slug", () => {
    for (const slug of slugs) {
      expect(isReserved(slug)).toBe(false);
    }
  });
});

describe("isReserved", () => {
  it("is case-insensitive", () => {
    expect(isReserved("API")).toBe(true);
    expect(isReserved("Dashboard")).toBe(true);
    expect(isReserved("LOGIN")).toBe(true);
  });

  it("returns false for a normal slug", () => {
    expect(isReserved("abc2345")).toBe(false);
  });
});
