import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOwnedLink } from "@/lib/links";

// Ownership check lives here, not in page.tsx: dashboard/[id]/loading.tsx
// makes Next.js implicitly wrap page.tsx (and everything below it) in a
// Suspense boundary that pre-commits to a 200 status as soon as it starts
// streaming. A notFound() thrown from inside that boundary — even
// synchronously, before any JSX — no longer produces a real 404; it renders
// the not-found UI on top of an already-sent 200 (confirmed directly). A
// layout at this same segment level sits outside that boundary, so its
// notFound() actually sets the response status correctly.
export default async function LinkDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  // dashboard/layout.tsx already checks this, but nested layouts render
  // concurrently with their ancestors rather than strictly gated by them —
  // confirmed directly, the same way page.tsx and layout.tsx at this same
  // segment race each other. Trusting a non-null assertion crashed with a
  // real TypeError instead of ever reaching the parent's redirect.
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const { id } = await params;

  // Same "doesn't exist" vs "exists but isn't yours" non-distinction as
  // every other ownership check in this app — never a distinct response
  // that would let a user probe which link IDs are real.
  const link = await getOwnedLink(id, userId);
  if (!link) {
    notFound();
  }

  return <>{children}</>;
}
