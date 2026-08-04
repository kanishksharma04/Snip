"use client";

import { useState } from "react";
import { DashboardNav } from "@/components/features/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconMenu2 } from "@tabler/icons-react";

type OrgOption = { id: string; name: string; isPersonal: boolean };
type NavUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function MobileNav({
  organizations,
  activeOrganizationId,
  user,
  onSignOut,
}: {
  organizations: OrgOption[];
  activeOrganizationId: string | null;
  user: NavUser;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
        <IconMenu2 className="size-5" />
      </Button>
      <DialogContent
        showCloseButton={false}
        className="bg-sidebar text-sidebar-foreground data-open:zoom-in-100 data-open:slide-in-from-left data-closed:zoom-out-100 data-closed:slide-out-to-left inset-y-0 left-0 h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-r p-0"
      >
        {/* Visually hidden — Radix requires a DialogTitle for a11y, but this
            drawer's own nav content ("Snip" wordmark, nav links) already
            makes its purpose obvious on screen. */}
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DashboardNav
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          user={user}
          onSignOut={onSignOut}
          onNavigate={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
