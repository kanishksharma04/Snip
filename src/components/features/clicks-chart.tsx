"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClicksOverTimePoint } from "@/lib/stats";

// getClicksOverTime returns a sparse series (only days with >=1 click).
// A continuous chart axis needs every day in range present, zero-filled —
// that's this component's job, not the query layer's.
function fillGaps(data: ClicksOverTimePoint[], days: number): ClicksOverTimePoint[] {
  const byDate = new Map(data.map((point) => [point.date, point.clicks]));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);

  const filled: ClicksOverTimePoint[] = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    filled.push({ date, clicks: byDate.get(date) ?? 0 });
  }
  return filled;
}

export function ClicksChartSkeleton() {
  return <Skeleton className="h-64 w-full" />;
}

export function ClicksChart({ data, days }: { data: ClicksOverTimePoint[]; days: number }) {
  // Zero clicks (empty data) and a single-day range both still produce at
  // least one point after gap-filling, so Recharts always has something
  // valid to render instead of an empty/broken chart.
  const filled = fillGaps(data, days);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filled}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} width={30} />
          <Tooltip />
          <Line type="monotone" dataKey="clicks" stroke="currentColor" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
