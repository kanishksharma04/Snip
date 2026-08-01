import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnonymousDemoForm } from "@/components/features/anonymous-demo-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconArrowRight, IconBolt, IconChartBar, IconCode, IconSparkles } from "@tabler/icons-react";

const FEATURES = [
  {
    icon: IconBolt,
    title: "Cache-first redirects",
    description: "Warm links resolve straight from Redis — Postgres is only touched on a cache miss.",
  },
  {
    icon: IconChartBar,
    title: "Real analytics",
    description:
      "Clicks over time, top referrers, device and country breakdowns — computed from pre-aggregated daily stats, not a slow scan on every page load.",
  },
  {
    icon: IconCode,
    title: "Public API",
    description: "Create and inspect links programmatically with a Bearer-authenticated API key.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4 backdrop-blur-md">
        <span className="text-lg font-semibold tracking-tight">Snip</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-hidden">
        {/* Decorative background glow — purely visual, clipped to this section */}
        <div
          aria-hidden
          className="animate-aurora bg-primary/25 dark:bg-primary/20 pointer-events-none absolute -top-48 left-1/2 -z-10 h-144 w-5xl -translate-x-1/2 rounded-full blur-3xl"
        />

        <div className="flex flex-col items-center gap-8 px-6 py-20 text-center sm:py-28">
          <div
            className="animate-in fade-in slide-in-from-bottom-2 flex flex-col items-center gap-5 duration-700"
          >
            <span className="border-border bg-muted/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
              <IconSparkles className="text-primary size-3.5" />
              Built like a real production service
            </span>
            <h1 className="text-5xl font-bold tracking-tight text-balance sm:text-6xl">
              Short links.{" "}
              <span className="from-primary to-primary/60 bg-linear-to-r bg-clip-text text-transparent">
                Real analytics.
              </span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg text-balance">
              Snip shortens your links, caches redirects at the edge of the request path, and shows
              you exactly who clicked — backed by Postgres and Redis, not a spreadsheet.
            </p>
          </div>

          <div
            className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-md delay-150 duration-700"
          >
            <div className="rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:p-5">
              <AnonymousDemoForm />
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 delay-300 duration-700">
            <Button asChild size="lg" className="group/cta gap-1.5 shadow-sm">
              <Link href="/login">
                Get started — it&apos;s free
                <IconArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" />
              </Link>
            </Button>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 grid w-full max-w-3xl gap-4 pt-8 delay-500 duration-700 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group border-border/80 bg-card hover:border-primary/40 hover:shadow-primary/5 flex flex-col items-start gap-2.5 rounded-xl border p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110">
                  <Icon className="size-4.5" />
                </div>
                <h2 className="font-semibold">{title}</h2>
                <p className="text-muted-foreground text-sm text-pretty">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="text-muted-foreground w-full border-t px-6 py-6 text-center text-xs">
          Snip — a URL shortener built to show its work.
        </footer>
      </main>
    </div>
  );
}
