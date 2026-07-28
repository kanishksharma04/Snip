"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAnonymousLink } from "@/lib/actions/anonymous";
import { formatDateTimeIst } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    toast.error("Could not copy to clipboard");
  });
}

export function AnonymousDemoForm() {
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState<{ shortUrl: string; expiresAt: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAnonymousLink(destination);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
    });
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="url"
          required
          placeholder="https://example.com/a-very-long-url"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending}>
          Shorten
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">
        No account needed. Demo links expire in 24 hours and are limited to 10 per hour —{" "}
        <a href="/login" className="text-primary underline">
          sign in
        </a>{" "}
        for permanent links and analytics.
      </p>
      {result && (
        <div className="bg-muted flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{result.shortUrl}</span>
            <span className="text-muted-foreground text-xs">
              Expires {formatDateTimeIst(new Date(result.expiresAt))}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.shortUrl)}>
            Copy
          </Button>
        </div>
      )}
    </div>
  );
}
