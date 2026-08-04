"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgSwitcher } from "@/components/features/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { IconLink, IconWorld, IconKey, IconUsers } from "@tabler/icons-react";

type OrgOption = { id: string; name: string; isPersonal: boolean };
type NavUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Links", icon: IconLink },
  { href: "/dashboard/domains", label: "Domains", icon: IconWorld },
  { href: "/dashboard/api-keys", label: "API keys", icon: IconKey },
  { href: "/dashboard/members", label: "Members", icon: IconUsers },
] as const;

// "Links" covers /dashboard itself plus /dashboard/new and /dashboard/[id] —
// anything that isn't under one of the other three named sections. The
// other three are active on an exact-prefix match.
function isItemActive(pathname: string, href: (typeof NAV_ITEMS)[number]["href"]): boolean {
  if (href === "/dashboard") {
    return !NAV_ITEMS.slice(1).some((item) => pathname.startsWith(item.href));
  }
  return pathname.startsWith(href);
}

export function DashboardNav({
  organizations,
  activeOrganizationId,
  user,
  onSignOut,
  onNavigate,
}: {
  organizations: OrgOption[];
  activeOrganizationId: string | null;
  user: NavUser;
  onSignOut: () => Promise<void>;
  // Called when a nav link is clicked — MobileNav uses this to close the
  // drawer immediately on click, rather than reactively watching the route
  // change (which would need an effect or a render-time ref mutation; this
  // event-handler approach needs neither). The desktop sidebar has no
  // drawer to close, so it just omits this prop.
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const initials = user.name?.trim().charAt(0)?.toUpperCase() || "?";

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-70"
      >
        Snip
      </Link>

      {organizations.length > 0 && activeOrganizationId && (
        <OrgSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          className="w-full justify-between"
        />
      )}

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-active={active || undefined}
              className={cn(
                "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="hover:bg-sidebar-accent focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none">
            <Avatar className="ring-border/80 size-7 shrink-0 ring-1">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-medium">{user.name}</span>
              <span className="text-muted-foreground text-xs font-normal">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={onSignOut}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full text-left">
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </div>
    </div>
  );
}
