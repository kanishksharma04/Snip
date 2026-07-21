import { randomBytes, createHash } from "node:crypto";

const KEY_PREFIX = "snip_";
// How much of the plaintext key is kept (unhashed) as keyPrefix, purely so
// the settings page can show "which key is this" — short enough that it
// can't be brute-forced back into the real secret, long enough to tell keys
// apart at a glance.
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8;

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

// The plaintext is returned here and only here — callers must show it to
// the user immediately and never persist it themselves. Everything this
// app stores afterward is the hash (for lookup) and the display prefix.
export function generateApiKey(): { plaintext: string; keyHash: string; keyPrefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    keyHash: hashApiKey(plaintext),
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}
