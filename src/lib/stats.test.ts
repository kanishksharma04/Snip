import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDailyStatFindMany = vi.fn();
const mockClickEventGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    dailyStat: { findMany: (...args: unknown[]) => mockDailyStatFindMany(...args) },
    clickEvent: { groupBy: (...args: unknown[]) => mockClickEventGroupBy(...args) },
  },
}));

import { getTopReferrers } from "@/lib/stats";

beforeEach(() => {
  mockDailyStatFindMany.mockReset();
  mockClickEventGroupBy.mockReset();
  mockClickEventGroupBy.mockResolvedValue([]);
});

describe("getTopReferrers — DailyStat JSON validation", () => {
  it("merges a well-formed referrers map correctly", async () => {
    mockDailyStatFindMany.mockResolvedValue([
      { referrers: { "google.com": 3, direct: 1 } },
      { referrers: { "google.com": 2 } },
    ]);

    const result = await getTopReferrers("link_1", 30);

    expect(result).toEqual([
      { referrer: "google.com", clicks: 5 },
      { referrer: "direct", clicks: 1 },
    ]);
  });

  it("throws instead of silently producing garbage when a value isn't a number", async () => {
    // Not hypothetical — this is exactly the shape a future aggregateDay
    // bug (or any other writer of this column) could produce: valid JSON,
    // wrong value type.
    mockDailyStatFindMany.mockResolvedValue([{ referrers: { "google.com": "not-a-number" } }]);

    await expect(getTopReferrers("link_1", 30)).rejects.toThrow();
  });

  it("throws when the column is a JSON array instead of an object", async () => {
    mockDailyStatFindMany.mockResolvedValue([{ referrers: ["google.com", "direct"] }]);

    await expect(getTopReferrers("link_1", 30)).rejects.toThrow();
  });

  it("throws when the column is null", async () => {
    mockDailyStatFindMany.mockResolvedValue([{ referrers: null }]);

    await expect(getTopReferrers("link_1", 30)).rejects.toThrow();
  });
});
