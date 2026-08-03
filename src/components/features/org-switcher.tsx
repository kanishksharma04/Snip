"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { switchActiveOrganization, createOrganization } from "@/lib/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";

type OrgOption = { id: string; name: string; isPersonal: boolean };

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrgOption[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const active = organizations.find((org) => org.id === activeOrganizationId);

  const handleSwitch = (organizationId: string) => {
    if (organizationId === activeOrganizationId) return;
    startTransition(async () => {
      const result = await switchActiveOrganization(organizationId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Database-strategy sessions re-read User fresh on the next request —
      // this refresh is what makes that next request happen.
      router.refresh();
    });
  };

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createOrganization(name);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization created", {
        description: "Switch to it from the menu whenever you're ready.",
      });
      setName("");
      setCreateOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none">
          <span className="max-w-40 truncate">{active?.name ?? "Select organization"}</span>
          <IconChevronDown className="text-muted-foreground size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={activeOrganizationId} onValueChange={handleSwitch}>
            {organizations.map((org) => (
              <DropdownMenuRadioItem key={org.id} value={org.id} disabled={isPending}>
                {org.name}
                {org.isPersonal && (
                  <span className="text-muted-foreground ml-1 text-xs">Personal</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
            <DialogDescription>
              Creates an empty organization you can invite others into. It won&apos;t switch you
              into it automatically — do that from the switcher once you&apos;re ready.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            autoFocus
          />
          <DialogFooter>
            <Button onClick={handleCreate} disabled={isPending || name.trim().length === 0}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
