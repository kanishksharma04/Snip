import { db } from "@/lib/db";
import { hashApiKey } from "@/lib/api-keys";

export type ApiAuthResult =
  | { authenticated: true; organizationId: string; apiKeyId: string }
  | { authenticated: false };

export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { authenticated: false };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { authenticated: false };
  }

  const apiKey = await db.apiKey.findUnique({
    where: { keyHash: hashApiKey(token) },
    select: { id: true, organizationId: true, revokedAt: true },
  });
  if (!apiKey || apiKey.revokedAt) {
    return { authenticated: false };
  }

  // Bookkeeping only — a slow or failed write here must never block or
  // fail the actual API request it's just recording metadata for.
  void db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  // Bound to the organization the key was created under — not whichever
  // org its creator currently has active (see the Organizations plan's
  // scope note on this). apiKey.organizationId, not the caller's session.
  return { authenticated: true, organizationId: apiKey.organizationId, apiKeyId: apiKey.id };
}
