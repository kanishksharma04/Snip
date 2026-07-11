import { cache } from "react";
import { auth } from "@/lib/auth";

// auth() hits Postgres directly (database session strategy) — layout.tsx and
// page.tsx both need the session, and without this cache() that's two DB
// round trips per request instead of one, deduped only within the request.
export const getSession = cache(auth);
