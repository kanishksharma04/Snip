"use client";

import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

// The rest of the row is static, server-rendered data — only this button
// needs client interactivity (navigator.clipboard), so only it is a Client
// Component. Marking the whole table "use client" would ship every row's
// data through the client bundle for no reason.
export function CopyShortUrlMenuItem({ shortUrl }: { shortUrl: string }) {
  return (
    <DropdownMenuItem
      onClick={() => {
        navigator.clipboard.writeText(shortUrl).catch(() => {
          toast.error("Could not copy to clipboard");
        });
      }}
    >
      Copy short link
    </DropdownMenuItem>
  );
}
