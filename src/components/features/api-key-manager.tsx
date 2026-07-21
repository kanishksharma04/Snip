"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createApiKey, revokeApiKey } from "@/lib/actions/api-keys";
import { formatDateIst } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    toast.error("Could not copy to clipboard");
  });
}

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createApiKey(name);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setKeys((prev) => [
        {
          id: result.data.id,
          name: result.data.name,
          keyPrefix: result.data.keyPrefix,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        },
        ...prev,
      ]);
      setName("");
      // Shown exactly once, in this dialog — nothing this app stores after
      // this point can reconstruct the plaintext, so closing the dialog
      // without copying it means it's gone for good.
      setRevealedKey(result.data.plaintext);
    });
  };

  const handleRevoke = (id: string) => {
    startTransition(async () => {
      const result = await revokeApiKey(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setKeys((prev) =>
        prev.map((key) => (key.id === id ? { ...key, revokedAt: new Date() } : key)),
      );
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-md items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="api-key-name" className="text-sm font-medium">
            Key name
          </label>
          <Input
            id="api-key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI pipeline"
          />
        </div>
        <Button onClick={handleCreate} disabled={isPending || name.trim().length === 0}>
          Generate key
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="text-muted-foreground text-sm">No API keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-sm">{key.keyPrefix}…</TableCell>
                <TableCell>{formatDateIst(key.createdAt)}</TableCell>
                <TableCell>{key.lastUsedAt ? formatDateIst(key.lastUsedAt) : "Never"}</TableCell>
                <TableCell>{key.revokedAt ? "Revoked" : "Active"}</TableCell>
                <TableCell>
                  {!key.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRevoke(key.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={revealedKey !== null} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy this now — it will not be shown again. Snip only stores a hash of it.
            </DialogDescription>
          </DialogHeader>
          <code className="bg-muted block overflow-x-auto rounded p-3 text-sm break-all">
            {revealedKey}
          </code>
          <DialogFooter>
            <Button variant="outline" onClick={() => revealedKey && copyToClipboard(revealedKey)}>
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
