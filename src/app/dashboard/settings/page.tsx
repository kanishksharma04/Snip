import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ApiKeyManager } from "@/components/features/api-key-manager";

export default async function SettingsPage() {
  // dashboard/layout.tsx already checks this for the correct HTTP status
  // (see its comment), but layout and page render concurrently rather than
  // the layout strictly gating the page — confirmed directly: trusting a
  // non-null assertion here crashed with a real, logged TypeError instead of
  // ever reaching the layout's redirect. getSession() is React
  // cache()-wrapped, so this re-check is a dedup, not a second real query.
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/dashboard/settings");
  }

  const apiKeys = await db.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 p-6 duration-500">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">API keys</h1>
        <p className="text-muted-foreground text-sm">
          Generate a key to use Snip&apos;s public API. Keys are shown in full exactly once.
        </p>
      </div>
      <ApiKeyManager initialKeys={apiKeys} />
    </div>
  );
}
