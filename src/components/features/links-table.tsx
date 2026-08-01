import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconLink } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyShortUrlMenuItem } from "@/components/features/copy-short-url-menu-item";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateIst, isPast } from "@/lib/format";
import { getSnipBaseUrl } from "@/lib/validations";
import { IconDots } from "@tabler/icons-react";

export function LinksTableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

type LinkRow = {
  id: string;
  slug: string;
  destination: string;
  clickCount: number;
  createdAt: Date;
  isActive: boolean;
  expiresAt: Date | null;
};

export function LinksTable({
  links,
  isFiltered = false,
}: {
  links: LinkRow[];
  isFiltered?: boolean;
}) {
  if (links.length === 0) {
    return (
      <Card className="animate-in fade-in duration-500">
        <CardHeader>
          <div className="bg-primary/10 text-primary mb-1 flex size-9 items-center justify-center rounded-lg">
            <IconLink className="size-4.5" />
          </div>
          <CardTitle>{isFiltered ? "No matching links" : "No links yet"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {isFiltered ? (
              "No links match that search."
            ) : (
              <>
                You haven&apos;t created any links yet.{" "}
                <Link
                  href="/dashboard/new"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Create your first link
                </Link>
                .
              </>
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const baseUrl = getSnipBaseUrl();

  return (
    <div className="animate-in fade-in overflow-hidden rounded-xl border duration-500">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Slug</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Clicks</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.map((link) => {
            const shortUrl = `${baseUrl}/${link.slug}`;
            const isExpired = link.expiresAt !== null && isPast(link.expiresAt);

            return (
              <TableRow key={link.id} className="group">
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/${link.id}`}
                    className="hover:text-primary transition-colors"
                  >
                    {link.slug}
                  </Link>
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-xs truncate"
                  title={link.destination}
                >
                  {link.destination}
                </TableCell>
                <TableCell className="font-medium">{link.clickCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateIst(link.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {isExpired && <Badge variant="destructive">Expired</Badge>}
                    {!link.isActive && <Badge variant="secondary">Disabled</Badge>}
                    {!isExpired && link.isActive && <Badge variant="outline">Active</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Link actions"
                        className="opacity-60 transition-opacity group-hover:opacity-100"
                      >
                        <IconDots className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <CopyShortUrlMenuItem shortUrl={shortUrl} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
