import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Welcome, {session.user?.name}</h1>
    </div>
  );
}
