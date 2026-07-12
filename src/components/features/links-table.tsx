import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDateIst, isPast } from "@/lib/format";
import { getSnipBaseUrl } from "@/lib/validations";
import { IconDots } from "@tabler/icons-react";

type LinkRow = {
  id: string;
  slug: string;
  destination: string;
  clickCount: number;
  createdAt: Date;
  isActive: boolean;
  expiresAt: Date | null;
};

export function LinksTable({ links }: { links: LinkRow[] }) {
  if (links.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No links yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            You haven&apos;t created any links yet.{" "}
            <Link href="/dashboard/new" className="text-primary underline">
              Create your first link
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const baseUrl = getSnipBaseUrl();

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
            <TableRow key={link.id}>
              <TableCell className="font-medium">{link.slug}</TableCell>
              <TableCell
                className="max-w-xs truncate"
                title={link.destination}
              >
                {link.destination}
              </TableCell>
              <TableCell>{link.clickCount}</TableCell>
              <TableCell>{formatDateIst(link.createdAt)}</TableCell>
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
                    <Button variant="ghost" size="icon-sm" aria-label="Link actions">
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
  );
}
