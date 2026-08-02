"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { addDomain, verifyDomain, deleteDomain, type DomainRow } from "@/lib/actions/domains";
import { verifyTxtRecordName, verifyTxtRecordValue } from "@/lib/domain-verification-record";
import { formatDateIst } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DomainManager({ initialDomains }: { initialDomains: DomainRow[] }) {
  const [domains, setDomains] = useState(initialDomains);
  const [hostname, setHostname] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    startTransition(async () => {
      const result = await addDomain(hostname);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDomains((prev) => [result.data, ...prev]);
      setHostname("");
    });
  };

  const handleVerify = (id: string) => {
    startTransition(async () => {
      const result = await verifyDomain(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDomains((prev) => prev.map((d) => (d.id === id ? result.data : d)));
      if (result.data.verifiedAt) {
        toast.success("Domain verified");
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteDomain(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDomains((prev) => prev.filter((d) => d.id !== id));
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-md items-end gap-2 rounded-2xl border p-5 shadow-sm sm:p-6">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="domain-hostname" className="text-sm font-medium">
            Domain
          </label>
          <Input
            id="domain-hostname"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="go.example.com"
          />
        </div>
        <Button onClick={handleAdd} disabled={isPending || hostname.trim().length === 0}>
          Add domain
        </Button>
      </div>

      {domains.length === 0 ? (
        <p className="text-muted-foreground text-sm">No domains yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <Fragment key={domain.id}>
                  <TableRow className="group">
                    <TableCell className="font-medium">{domain.hostname}</TableCell>
                    <TableCell>
                      {domain.verifiedAt ? (
                        <Badge variant="outline">Verified</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateIst(domain.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        {!domain.verifiedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleVerify(domain.id)}
                          >
                            Verify
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDelete(domain.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {!domain.verifiedAt && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="bg-muted/30">
                        <p className="text-muted-foreground mb-2 text-xs">
                          Add this TXT record at your DNS provider, then click Verify. Changes
                          can take a few minutes to propagate.
                        </p>
                        <code className="bg-muted block overflow-x-auto rounded p-3 text-xs break-all">
                          {verifyTxtRecordName(domain.hostname)}
                          {"  TXT  "}
                          {verifyTxtRecordValue(domain.verifyToken)}
                        </code>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
