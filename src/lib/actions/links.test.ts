import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mockCreate = vi.fn();
// No verified domain matches by default in these tests — the redirect-loop
// guard and domainId resolution both call db.domain.findFirst, and neither
// is what this file's collision-retry tests are about.
const mockDomainFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    link: { create: (...args: unknown[]) => mockCreate(...args) },
    domain: { findFirst: (...args: unknown[]) => mockDomainFindFirst(...args) },
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: "user_1" } })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getSession } from "@/lib/session";
import { createLink } from "@/lib/actions/links";

function slugCollisionError(field = "slug") {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      driverAdapterError: {
        cause: { constraint: { fields: [field] } },
      },
    },
  });
}

beforeEach(() => {
  mockCreate.mockReset();
  mockDomainFindFirst.mockReset();
  mockDomainFindFirst.mockResolvedValue(null);
  vi.mocked(getSession).mockResolvedValue({
    user: { id: "user_1" },
  } as never);
});

describe("createLink — auth", () => {
  it("rejects when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null as never);

    const result = await createLink({ destination: "https://example.com" });

    expect(result.success).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("createLink — auto-generated slug collision", () => {
  it("retries on collision and succeeds on the third attempt", async () => {
    mockCreate
      .mockRejectedValueOnce(slugCollisionError())
      .mockRejectedValueOnce(slugCollisionError())
      .mockResolvedValueOnce({
        id: "link_1",
        slug: "abcdefg",
        destination: "https://example.com",
      });

    const result = await createLink({ destination: "https://example.com" });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
  });

  it("gives up after exhausting retries", async () => {
    mockCreate.mockRejectedValue(slugCollisionError());

    const result = await createLink({ destination: "https://example.com" });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
  });
});

describe("createLink — custom slug collision", () => {
  it("does NOT retry — reports the slug as taken on the first collision", async () => {
    mockCreate.mockRejectedValueOnce(slugCollisionError());

    const result = await createLink({
      destination: "https://example.com",
      customSlug: "my-link",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/taken/i);
    }
  });
});

describe("createLink — non-collision failures never retry", () => {
  it("does not retry a plain database error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("connection refused"));

    const result = await createLink({ destination: "https://example.com" });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it("does not retry a P2002 on a different constraint", async () => {
    mockCreate.mockRejectedValueOnce(slugCollisionError("email"));

    const result = await createLink({ destination: "https://example.com" });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });
});

describe("createLink — redirect-loop guard against verified custom domains", () => {
  it("rejects a destination hostname that matches a verified domain", async () => {
    mockDomainFindFirst.mockResolvedValueOnce({ id: "domain_1" });

    const result = await createLink({ destination: "https://go.example.com/anything" });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/point back to snip/i);
    }
  });

  it("allows a destination that doesn't match any verified domain", async () => {
    mockDomainFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "link_1", slug: "abcdefg", destination: "https://example.com" });

    const result = await createLink({ destination: "https://example.com" });

    expect(result.success).toBe(true);
  });
});
