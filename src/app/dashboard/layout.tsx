import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { getUserOrganizations } from "@/lib/organizations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { OrgSwitcher } from "@/components/features/org-switcher";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // Every /dashboard/* route requires a session — enforced once, here, in the
  // shared layout rather than per-page. This isn't just deduplication: this
  // layout sits outside the Suspense boundary that dashboard/[id]/loading.tsx
  // implicitly wraps its subtree in, so a redirect() thrown from inside a
  // *page* component under a streaming loading.tsx boundary gets its status
  // code silently downgraded to 200 (confirmed directly — real bug, not a
  // hypothetical). A layout's redirect runs before any of that streaming
  // commitment, so it actually produces a real 307 instead of a 200 the
  // client happens to navigate away from.
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }
  const user = session.user;
  const initials = user.name?.trim().charAt(0)?.toUpperCase() || "?";

  const memberships = await getUserOrganizations(user.id);
  const organizations = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    isPersonal: m.organization.isPersonal,
  }));

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-70"
          >
            Snip
          </Link>
          {organizations.length > 0 && user.organizationId && (
            <OrgSwitcher organizations={organizations} activeOrganizationId={user.organizationId} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full ring-offset-background transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Avatar className="ring-border/80 ring-1 transition-shadow hover:ring-primary/40">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="flex flex-col">
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={signOutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full text-left">
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
