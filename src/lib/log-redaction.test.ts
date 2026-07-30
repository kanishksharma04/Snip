import { describe, expect, it } from "vitest";
import { redactUrls } from "@/lib/log-redaction";

describe("redactUrls", () => {
  it("strips the query string and hash off an embedded URL, keeping origin and pathname", () => {
    const input = "fetch failed for https://example.com/reset-password?token=abc123&uid=42#step-2";
    expect(redactUrls(input)).toBe("fetch failed for https://example.com/reset-password");
  });

  it("redacts every URL in a string with multiple URLs", () => {
    const input = "from https://a.example/x?secret=1 to https://b.example/y?secret=2";
    expect(redactUrls(input)).toBe("from https://a.example/x to https://b.example/y");
  });

  it("leaves a URL with no query string or hash unchanged", () => {
    const input = "see https://example.com/plain/path";
    expect(redactUrls(input)).toBe("see https://example.com/plain/path");
  });

  it("leaves text with no URL untouched", () => {
    const input = "TypeError: Cannot read properties of null (reading 'user')";
    expect(redactUrls(input)).toBe(input);
  });

  it("handles a multi-line stack trace with an embedded destination URL", () => {
    const input = [
      "Error: redirect failed",
      "  destination: https://example.com/promo?ref=affiliate&token=xyz",
      "    at proxy (/app/proxy.ts:10:1)",
    ].join("\n");
    expect(redactUrls(input)).toBe(
      ["Error: redirect failed", "  destination: https://example.com/promo", "    at proxy (/app/proxy.ts:10:1)"].join(
        "\n",
      ),
    );
  });
});
