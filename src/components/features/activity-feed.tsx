import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeIst } from "@/lib/format";

type ClickEventRow = {
  id: string;
  createdAt: Date;
  country: string | null;
  device: string | null;
  referrer: string | null;
};

export function ActivityFeedSkeleton() {
  return <Skeleton className="h-56 w-full" />;
}

export function ActivityFeed({ events }: { events: ClickEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No clicks recorded yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Device</TableHead>
          <TableHead>Referrer</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>{formatDateTimeIst(event.createdAt)}</TableCell>
            <TableCell>{event.country ?? "Unknown"}</TableCell>
            <TableCell>{event.device ?? "Unknown"}</TableCell>
            <TableCell>{event.referrer ?? "direct"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
