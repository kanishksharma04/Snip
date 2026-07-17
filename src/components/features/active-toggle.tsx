"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleLinkActive } from "@/lib/actions/links";

export function ActiveToggle({ linkId, isActive }: { linkId: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Switch
      checked={isActive}
      disabled={isPending}
      onCheckedChange={() => {
        startTransition(async () => {
          const result = await toggleLinkActive(linkId);
          if (!result.success) {
            toast.error(result.error);
          }
        });
      }}
    />
  );
}
