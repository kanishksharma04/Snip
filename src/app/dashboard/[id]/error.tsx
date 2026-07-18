"use client";

import { Button } from "@/components/ui/button";

export default function LinkDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-lg font-semibold">Couldn&apos;t load this link</h1>
      <p className="text-muted-foreground text-sm">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
