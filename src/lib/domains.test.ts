import { describe, expect, it, vi, beforeEach } from "vitest";

const mockResolveTxt = vi.fn();

vi.mock("node:dns/promises", () => ({
  resolveTxt: (...args: unknown[]) => mockResolveTxt(...args),
}));

import { checkDomainVerification } from "@/lib/domains";
import { hostnameSchema } from "@/lib/validations";
import { verifyTxtRecordName, verifyTxtRecordValue } from "@/lib/domain-verification-record";

beforeEach(() => {
  mockResolveTxt.mockReset();
});

describe("hostnameSchema", () => {
  it("accepts a well-formed subdomain", () => {
    expect(hostnameSchema.safeParse("go.example.com").success).toBe(true);
  });

  it("lowercases the hostname", () => {
    const result = hostnameSchema.safeParse("Go.Example.COM");
    expect(result.success && result.data).toBe("go.example.com");
  });

  it("rejects a bare label with no dot", () => {
    expect(hostnameSchema.safeParse("localhost").success).toBe(false);
  });

  it("rejects an IPv4 address", () => {
    expect(hostnameSchema.safeParse("192.168.1.1").success).toBe(false);
  });

  it("rejects a label with a leading or trailing hyphen", () => {
    expect(hostnameSchema.safeParse("-go.example.com").success).toBe(false);
    expect(hostnameSchema.safeParse("go-.example.com").success).toBe(false);
  });
});

describe("checkDomainVerification", () => {
  it("verifies when the expected TXT record is present", async () => {
    mockResolveTxt.mockResolvedValueOnce([["snip-verify=abc123"]]);

    const result = await checkDomainVerification("go.example.com", "abc123");

    expect(mockResolveTxt).toHaveBeenCalledWith(verifyTxtRecordName("go.example.com"));
    expect(result).toEqual({ verified: true });
  });

  it("reassembles a TXT record split into multiple chunks", async () => {
    mockResolveTxt.mockResolvedValueOnce([["snip-verify=", "abc123"]]);

    const result = await checkDomainVerification("go.example.com", "abc123");

    expect(result).toEqual({ verified: true });
  });

  it("does not verify when the token doesn't match", async () => {
    mockResolveTxt.mockResolvedValueOnce([["snip-verify=wrong"]]);

    const result = await checkDomainVerification("go.example.com", "abc123");

    expect(result).toEqual({ verified: false, reason: "not_found" });
  });

  it("treats a missing record (ENOTFOUND) as not-yet-verified, not an error", async () => {
    mockResolveTxt.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));

    const result = await checkDomainVerification("go.example.com", "abc123");

    expect(result).toEqual({ verified: false, reason: "not_found" });
  });

  it("reports a genuine DNS failure distinctly from a missing record", async () => {
    mockResolveTxt.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }));

    const result = await checkDomainVerification("go.example.com", "abc123");

    expect(result).toEqual({ verified: false, reason: "lookup_failed" });
  });
});

describe("verifyTxtRecordName / verifyTxtRecordValue", () => {
  it("builds the expected challenge subdomain and value", () => {
    expect(verifyTxtRecordName("go.example.com")).toBe("_snip-challenge.go.example.com");
    expect(verifyTxtRecordValue("abc123")).toBe("snip-verify=abc123");
  });
});
