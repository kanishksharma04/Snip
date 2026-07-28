import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnonymousDemoForm } from "@/components/features/anonymous-demo-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold">Snip</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Snip</h1>
          <p className="text-muted-foreground max-w-xl text-lg">
            A URL shortener built for real production use: edge-cached redirects, real click
            analytics by referrer, device and country, and a public API — all backed by Postgres
            and Redis, not a spreadsheet.
          </p>
        </div>

        <AnonymousDemoForm />

        <Button asChild size="lg">
          <Link href="/login">Get started — it&apos;s free</Link>
        </Button>

        <div className="grid max-w-3xl gap-6 pt-8 text-left sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Cache-first redirects</h2>
            <p className="text-muted-foreground text-sm">
              Warm links resolve straight from Redis — Postgres is only touched on a cache miss.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Real analytics</h2>
            <p className="text-muted-foreground text-sm">
              Clicks over time, top referrers, device and country breakdowns — computed from
              pre-aggregated daily stats, not a slow scan on every page load.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Public API</h2>
            <p className="text-muted-foreground text-sm">
              Create and inspect links programmatically with a Bearer-authenticated API key.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
