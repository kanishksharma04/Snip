import type { Instrumentation } from "next";

// No Sentry/external account configured for this project — this is Next's
// own built-in error-capture hook instead, logging every unhandled
// server-side error as structured JSON that Vercel's existing log
// aggregation already captures and can be filtered/searched on, with no new
// service to set up. It's also literally the same integration point
// Sentry's own Next.js SDK hooks into, so wiring up real Sentry later is an
// additive change to this one function, not a rewrite.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest = (error as { digest?: string } | null | undefined)?.digest;

  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      digest,
      path: request.path,
      method: request.method,
      routeType: context.routeType,
      routePath: context.routePath,
      renderSource: context.renderSource,
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
};
