import { describe, expect, it } from "vitest";
import { customSlugSchema, destinationSchema } from "@/lib/validations";

describe("destinationSchema", () => {
  it("accepts a normal https URL", () => {
    expect(destinationSchema.safeParse("https://example.com/path").success).toBe(true);
  });

  it("accepts a normal http URL", () => {
    expect(destinationSchema.safeParse("http://example.com/path").success).toBe(true);
  });

  it("rejects javascript: URIs, including obfuscated ones", () => {
    expect(destinationSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(
      destinationSchema.safeParse("javascript:alert(1)//https://x.com").success,
    ).toBe(false);
  });

  it("rejects data: URIs", () => {
    expect(
      destinationSchema.safeParse("data:text/html,<script>alert(1)</script>").success,
    ).toBe(false);
  });

  it("rejects file: URIs", () => {
    expect(destinationSchema.safeParse("file:///etc/passwd").success).toBe(false);
  });

  it("rejects vbscript: URIs", () => {
    expect(destinationSchema.safeParse("vbscript:msgbox(1)").success).toBe(false);
  });

  it("rejects a destination pointing back at Snip's own domain", () => {
    expect(destinationSchema.safeParse("https://snip-blush.vercel.app/x").success).toBe(
      false,
    );
  });

  it("matches Snip's domain on exact hostname, not substring", () => {
    // A naive `.includes()` check would wrongly reject both of these —
    // neither hostname is actually equal to "snip-blush.vercel.app".
    expect(
      destinationSchema.safeParse("https://not-snip-blush.vercel.app/x").success,
    ).toBe(true);
    expect(
      destinationSchema.safeParse("https://snip-blush.vercel.app.evil.com/x").success,
    ).toBe(true);
  });

  it("rejects localhost", () => {
    expect(destinationSchema.safeParse("http://localhost:3000").success).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    expect(destinationSchema.safeParse("http://127.0.0.1/").success).toBe(false);
  });

  it("rejects ::1", () => {
    expect(destinationSchema.safeParse("http://[::1]/").success).toBe(false);
  });

  it("rejects 0.0.0.0", () => {
    expect(destinationSchema.safeParse("http://0.0.0.0/").success).toBe(false);
  });

  it("rejects the 10.0.0.0/8 private range", () => {
    expect(destinationSchema.safeParse("http://10.1.2.3/").success).toBe(false);
  });

  it("rejects the 172.16.0.0/12 private range", () => {
    expect(destinationSchema.safeParse("http://172.16.0.1/").success).toBe(false);
    expect(destinationSchema.safeParse("http://172.31.255.255/").success).toBe(false);
    // 172.15.x and 172.32.x are outside the /12 and should be allowed.
    expect(destinationSchema.safeParse("http://172.15.0.1/").success).toBe(true);
    expect(destinationSchema.safeParse("http://172.32.0.1/").success).toBe(true);
  });

  it("rejects the 192.168.0.0/16 private range", () => {
    expect(destinationSchema.safeParse("http://192.168.1.1/").success).toBe(false);
  });

  it("rejects the 169.254.0.0/16 link-local range, including the cloud metadata IP", () => {
    expect(destinationSchema.safeParse("http://169.254.169.254/").success).toBe(false);
    expect(destinationSchema.safeParse("http://169.254.0.1/").success).toBe(false);
  });

  it("rejects decimal and hex IPv4 encodings of a private address", () => {
    // http://2130706433/ and http://0x7f000001/ both mean 127.0.0.1 — the
    // WHATWG URL parser normalizes these to dotted-decimal before we see
    // `.hostname`, so the same private-range check catches them.
    expect(destinationSchema.safeParse("http://2130706433/").success).toBe(false);
    expect(destinationSchema.safeParse("http://0x7f000001/").success).toBe(false);
  });

  it("rejects an IPv4-mapped IPv6 address for a private target", () => {
    expect(destinationSchema.safeParse("http://[::ffff:127.0.0.1]/").success).toBe(
      false,
    );
    expect(destinationSchema.safeParse("http://[::ffff:10.0.0.1]/").success).toBe(
      false,
    );
  });

  it("rejects URLs longer than 2048 characters", () => {
    const long = "https://example.com/" + "a".repeat(2048);
    expect(destinationSchema.safeParse(long).success).toBe(false);
  });

  it("rejects strings new URL() cannot parse", () => {
    expect(destinationSchema.safeParse("not a url").success).toBe(false);
    expect(destinationSchema.safeParse("").success).toBe(false);
  });
});

describe("customSlugSchema", () => {
  it("accepts a valid slug", () => {
    expect(customSlugSchema.safeParse("my-link_1").success).toBe(true);
  });

  it("rejects slugs shorter than 3 characters", () => {
    expect(customSlugSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects slugs longer than 32 characters", () => {
    expect(customSlugSchema.safeParse("a".repeat(33)).success).toBe(false);
  });

  it("rejects characters outside [a-zA-Z0-9_-]", () => {
    expect(customSlugSchema.safeParse("has space").success).toBe(false);
    expect(customSlugSchema.safeParse("has.dot").success).toBe(false);
  });

  it("rejects reserved words via Step 8's isReserved, not a duplicated list", () => {
    expect(customSlugSchema.safeParse("dashboard").success).toBe(false);
    expect(customSlugSchema.safeParse("Dashboard").success).toBe(false);
  });
});
