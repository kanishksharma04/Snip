// Shared between /api/cron/aggregate and /api/cron/aggregate/health — both
// are public URLs, so a matching secret is the only thing standing between
// an open endpoint and one that requires the value only this deployment and
// its Vercel Cron config (or whoever operates it) know.
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
