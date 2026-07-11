import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { isSafeRedirectPath } from "@/lib/utils";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const redirectTo = isSafeRedirectPath(callbackUrl) ? callbackUrl : "/dashboard";

  const session = await getSession();
  if (session) {
    redirect(redirectTo);
  }

  async function signInWithGitHub() {
    "use server";
    await signIn("github", { redirectTo });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">Sign in to Snip</h1>
      <form action={signInWithGitHub}>
        <Button type="submit">Sign in with GitHub</Button>
      </form>
    </div>
  );
}
