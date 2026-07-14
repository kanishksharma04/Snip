import { Redis } from "@upstash/redis";

// devtrack-redis is a shared, existing free-tier Upstash instance — it is
// NOT dedicated to Snip. Every key this app writes must stay under this one
// prefix, and nothing here may enumerate or wipe the keyspace:
//   - only ever GET/SET/DEL one exact key at a time
//   - never SCAN or KEYS (would enumerate another project's keys too)
//   - never FLUSHDB / FLUSHALL / any wildcard delete
export const LINK_CACHE_PREFIX = "link:";

export const redis = Redis.fromEnv();
