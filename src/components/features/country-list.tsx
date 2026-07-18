import { Skeleton } from "@/components/ui/skeleton";
import type { CountryCount } from "@/lib/stats";

// Converts an ISO 3166-1 alpha-2 code (e.g. "US") to its flag emoji by
// offsetting each letter into the Unicode Regional Indicator Symbol block.
function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

export function CountryListSkeleton() {
  return <Skeleton className="h-40 w-full" />;
}

export function CountryList({ data }: { data: CountryCount[] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No country data yet.</p>;
  }

  const total = data.reduce((sum, row) => sum + row.clicks, 0);

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row) => (
        <li key={row.country} className="flex items-center justify-between text-sm">
          <span>
            {countryFlag(row.country)} {row.country}
          </span>
          <span className="text-muted-foreground">
            {row.clicks} · {total > 0 ? Math.round((row.clicks / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}
