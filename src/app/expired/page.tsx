import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ExpiredPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">This link is no longer available</h1>
      <p className="text-muted-foreground max-w-sm">
        The link you followed has expired or been disabled by its owner.
      </p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
