// Regression check for a real bug found and fixed in this codebase: a
// loading.tsx file at a shared layout's segment implicitly wraps its entire
// subtree in a Suspense boundary that pre-commits to a 200 HTTP status as
// soon as it starts streaming — so redirect()/notFound() calls anywhere
// below it silently stop working at the HTTP level, even though the
// rendered *content* still looks like a redirect or a 404 page. That bug
// shipped for every /dashboard/* route until it was caught.
//
// This only fails if someone reintroduces it (e.g. adding a loading.tsx back
// at the /dashboard segment, or removing an auth check from a layout without
// noticing pages don't strictly gate on it). It spins up its own dev server
// on a dedicated port and its own throwaway user/session/link, so it never
// touches real data and never depends on a real login.
import { spawn, type ChildProcess } from "node:child_process";
import { db } from "../src/lib/db";

const PORT = Number(process.env.CHECK_PORT ?? 3999);
const BASE_URL = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 60_000;

type Check = {
  name: string;
  path: string;
  cookie?: string;
  expectedStatus: number;
};

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready within ${READY_TIMEOUT_MS}ms`);
}

async function runChecks(checks: Check[]): Promise<string[]> {
  const failures: string[] = [];
  for (const check of checks) {
    const res = await fetch(`${BASE_URL}${check.path}`, {
      redirect: "manual",
      headers: check.cookie ? { Cookie: check.cookie } : undefined,
    });
    const ok = res.status === check.expectedStatus;
    console.log(`${ok ? "OK  " : "FAIL"} ${check.name}: expected ${check.expectedStatus}, got ${res.status}`);
    if (!ok) failures.push(check.name);
  }
  return failures;
}

async function main() {
  const runId = Date.now();
  const user = await db.user.create({
    data: { email: `auth-status-check-${runId}@example.invalid`, name: "Auth Status Check" },
  });
  const sessionToken = `auth-status-check-session-${runId}`;
  await db.session.create({
    data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 60 * 60 * 1000) },
  });
  const link = await db.link.create({
    data: { userId: user.id, slug: `authchk${runId}`.slice(0, 32), destination: "https://example.com/auth-status-check" },
  });
  const cookie = `authjs.session-token=${sessionToken}`;

  let server: ChildProcess | undefined;
  try {
    server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
      cwd: new URL("..", import.meta.url).pathname,
      stdio: "ignore",
      env: { ...process.env },
    });
    await waitForServer();

    const checks: Check[] = [
      { name: "unauthenticated /dashboard redirects", path: "/dashboard", expectedStatus: 307 },
      { name: "unauthenticated /dashboard/new redirects", path: "/dashboard/new", expectedStatus: 307 },
      { name: "unauthenticated /dashboard/settings redirects", path: "/dashboard/settings", expectedStatus: 307 },
      { name: "unauthenticated /dashboard/[id] redirects", path: `/dashboard/${link.id}`, expectedStatus: 307 },
      { name: "authenticated /dashboard loads", path: "/dashboard", cookie, expectedStatus: 200 },
      { name: "authenticated /dashboard/new loads", path: "/dashboard/new", cookie, expectedStatus: 200 },
      { name: "authenticated /dashboard/settings loads", path: "/dashboard/settings", cookie, expectedStatus: 200 },
      { name: "authenticated real link loads", path: `/dashboard/${link.id}`, cookie, expectedStatus: 200 },
      {
        name: "authenticated nonexistent link 404s",
        path: `/dashboard/does-not-exist-${runId}`,
        cookie,
        expectedStatus: 404,
      },
    ];

    const failures = await runChecks(checks);
    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll dashboard auth/status checks passed.");
    }
  } finally {
    server?.kill();
    await db.link.delete({ where: { id: link.id } }).catch(() => {});
    await db.session.delete({ where: { sessionToken } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
