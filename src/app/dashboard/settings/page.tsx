import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ApiKeyManager } from "@/components/features/api-key-manager";

export default async function SettingsPage() {
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
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">API keys</h1>
        <p className="text-muted-foreground text-sm">
          Generate a key to use Snip&apos;s public API. Keys are shown in full exactly once.
        </p>
      </div>
      <ApiKeyManager initialKeys={apiKeys} />
    </div>
  );
}
