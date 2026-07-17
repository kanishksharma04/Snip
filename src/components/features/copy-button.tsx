"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ text }: { text: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {
          toast.error("Could not copy to clipboard");
        });
      }}
    >
      Copy
    </Button>
  );
}
