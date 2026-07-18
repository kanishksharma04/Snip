import { Skeleton } from "@/components/ui/skeleton";

export default function LinkDetailLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-5 w-56" />
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
