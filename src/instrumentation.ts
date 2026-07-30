import type { Instrumentation } from "next";
import { redactUrls } from "@/lib/log-redaction";

// No Sentry/external account configured for this project — this is Next's
// own built-in error-capture hook instead, logging every unhandled
// server-side error as structured JSON that Vercel's existing log
// aggregation already captures and can be filtered/searched on, with no new
// service to set up. It's also literally the same integration point
// Sentry's own Next.js SDK hooks into — see README's Infrastructure section
// for why adding real Sentry later means registering it alongside this
// hook, not replacing it.
//
// One JSON object per line, always this same key set (even when a value is
// undefined) — a stable shape is what makes this actually greppable in
// Vercel's log viewer, rather than a different set of fields every time.
// route is the normalized route pattern (e.g. "/dashboard/[id]"), not the
// exact requested path — that groups correctly across different IDs
// instead of producing a "new" shape per request. message/stack are run
// through redactUrls() because either can end up echoing a raw URL from
// anywhere in the request — most notably a link's destination, which can
// carry tokens or PII in its query string — never logged unredacted.
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const digest = (error as { digest?: string } | null | undefined)?.digest;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      route: context.routePath,
      digest,
      message: redactUrls(message),
      stack: stack ? redactUrls(stack) : undefined,
    }),
  );
};
