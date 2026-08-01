import Link from "next/link";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;

// Plain server-rendered links, not Radix Tabs: the range must survive a
// refresh and be shareable via URL, which means it has to be real navigation
// to a real search param — not client-only component state.
export function RangeTabs({ linkId, activeDays }: { linkId: string; activeDays: number }) {
  return (
    <div className="inline-flex gap-1 rounded-lg border p-1">
      {RANGES.map((days) => (
        <Link
          key={days}
          href={`/dashboard/${linkId}?range=${days}`}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            days === activeDays
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {days}d
        </Link>
      ))}
    </div>
  );
}

export function parseRangeDays(value: string | undefined): number {
  const parsed = Number(value);
  return RANGES.includes(parsed as (typeof RANGES)[number]) ? parsed : 30;
}
