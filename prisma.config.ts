import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: path.join(import.meta.dirname, ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // @ts-expect-error — prisma/config's published Datasource type omits
    // directUrl even though the schema engine requires and accepts it
    // (confirmed via `prisma validate`); the .d.ts lags the real config shape.
    directUrl: env("DIRECT_URL"),
  },
});
