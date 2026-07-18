import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReferrerCount } from "@/lib/stats";

export function ReferrerTableSkeleton() {
  return <Skeleton className="h-40 w-full" />;
}

export function ReferrerTable({ data }: { data: ReferrerCount[] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No referrer data yet.</p>;
  }

  const total = data.reduce((sum, row) => sum + row.clicks, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Referrer</TableHead>
          <TableHead>Clicks</TableHead>
          <TableHead>%</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.referrer}>
            <TableCell>{row.referrer}</TableCell>
            <TableCell>{row.clicks}</TableCell>
            <TableCell>{total > 0 ? Math.round((row.clicks / total) * 100) : 0}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
