import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { verifyTxtRecordName, verifyTxtRecordValue } from "@/lib/domain-verification-record";

export function generateVerifyToken(): string {
  return randomBytes(16).toString("hex");
}

export type DomainVerificationResult =
  | { verified: true }
  // Distinguishes "checked, and the record isn't there (yet)" from a real
  // failure — DNS propagation delay after a user adds the record is the
  // expected, normal case here, not an error state to alarm them with.
  | { verified: false; reason: "not_found" | "lookup_failed" };

// TXT records can be split into multiple quoted chunks by a DNS provider;
// Node's resolveTxt already reassembles each record into one string[]
// (one entry per record, not per chunk) — flattening with .join("") per
// record (not across records) is what correctly handles that without
// merging two unrelated TXT records together.
export async function checkDomainVerification(
  hostname: string,
  token: string,
): Promise<DomainVerificationResult> {
  const expected = verifyTxtRecordValue(token);

  try {
    const records = await resolveTxt(verifyTxtRecordName(hostname));
    const found = records.some((chunks) => chunks.join("") === expected);
    return found ? { verified: true } : { verified: false, reason: "not_found" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { verified: false, reason: "not_found" };
    }
    return { verified: false, reason: "lookup_failed" };
  }
}
