import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    clickEvent: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    dailyStat: { upsert: (...args: unknown[]) => mockUpsert(...args) },
  },
}));

import { aggregateDay } from "@/lib/aggregate";

const EVENTS = [
  { linkId: "link_1", ipHash: "visitor_a", country: "US", device: "desktop", referrer: "google.com" },
  { linkId: "link_1", ipHash: "visitor_a", country: "US", device: "desktop", referrer: "google.com" },
  { linkId: "link_1", ipHash: "visitor_b", country: "IN", device: "mobile", referrer: null },
  { linkId: "link_2", ipHash: "visitor_c", country: null, device: null, referrer: "twitter.com" },
];

beforeEach(() => {
  mockFindMany.mockReset();
  mockUpsert.mockReset();
  mockFindMany.mockResolvedValue(EVENTS);
});

describe("aggregateDay", () => {
  it("groups clicks per link with unique visitors and count maps", async () => {
    await aggregateDay(new Date("2026-07-15T12:00:00Z"));

    expect(mockUpsert).toHaveBeenCalledTimes(2);

    const link1Call = mockUpsert.mock.calls.find((call) => call[0].where.linkId_date.linkId === "link_1");
    expect(link1Call).toBeDefined();
    expect(link1Call![0].create).toMatchObject({
      linkId: "link_1",
      clicks: 3,
      uniqueVisitors: 2,
      countries: { US: 2, IN: 1 },
      devices: { desktop: 2, mobile: 1 },
      referrers: { "google.com": 2, direct: 1 },
    });

    const link2Call = mockUpsert.mock.calls.find((call) => call[0].where.linkId_date.linkId === "link_2");
    expect(link2Call).toBeDefined();
    expect(link2Call![0].create).toMatchObject({
      linkId: "link_2",
      clicks: 1,
      uniqueVisitors: 1,
      countries: { Unknown: 1 },
      devices: { Unknown: 1 },
      referrers: { "twitter.com": 1 },
    });
  });

  it("normalizes the input date to a UTC calendar day boundary", async () => {
    await aggregateDay(new Date("2026-07-15T23:59:59Z"));

    const call = mockUpsert.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0].where.linkId_date.date).toEqual(new Date("2026-07-15T00:00:00.000Z"));

    const findManyCall = mockFindMany.mock.calls[0];
    expect(findManyCall).toBeDefined();
    const [findManyArgs] = findManyCall!;
    expect(findManyArgs.where.createdAt.gte).toEqual(new Date("2026-07-15T00:00:00.000Z"));
    expect(findManyArgs.where.createdAt.lt).toEqual(new Date("2026-07-16T00:00:00.000Z"));
  });

  it("is idempotent — running it twice for the same date upserts identical numbers", async () => {
    const date = new Date("2026-07-15T12:00:00Z");

    await aggregateDay(date);
    const firstRunCalls = mockUpsert.mock.calls.map((call) => call[0]);

    mockUpsert.mockReset();

    await aggregateDay(date);
    const secondRunCalls = mockUpsert.mock.calls.map((call) => call[0]);

    expect(secondRunCalls).toEqual(firstRunCalls);
  });
});
