// Pure string formatting only, deliberately split out of src/lib/domains.ts
// — that file imports node:dns/promises and node:crypto, which breaks a
// Client Component's bundle if pulled in transitively. This module has no
// such imports, so src/components/features/domain-manager.tsx (which needs
// to render the TXT record name/value) can import it directly.

const VERIFY_RECORD_PREFIX = "_snip-challenge";
const VERIFY_VALUE_PREFIX = "snip-verify=";

export function verifyTxtRecordName(hostname: string): string {
  return `${VERIFY_RECORD_PREFIX}.${hostname}`;
}

export function verifyTxtRecordValue(token: string): string {
  return `${VERIFY_VALUE_PREFIX}${token}`;
}
