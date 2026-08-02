import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ApiKeyManager } from "@/components/features/api-key-manager";
import { DomainManager } from "@/components/features/domain-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const [apiKeys, domains] = await Promise.all([
    db.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
    }),
    db.domain.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, hostname: true, verifyToken: true, verifiedAt: true, createdAt: true },
    }),
  ]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 p-6 duration-500">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </div>
      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
        </TabsList>
        <TabsContent value="api-keys" className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Generate a key to use Snip&apos;s public API. Keys are shown in full exactly once.
          </p>
          <ApiKeyManager initialKeys={apiKeys} />
        </TabsContent>
        <TabsContent value="domains" className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Attach your own domain to short links you create. Ownership is verified with a DNS
            TXT record — you&apos;ll still need to add the domain in your hosting provider
            separately for it to actually route traffic here.
          </p>
          <DomainManager initialDomains={domains} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
