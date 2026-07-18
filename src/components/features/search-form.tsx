import { Input } from "@/components/ui/input";

// A plain GET form, not a controlled client input: submitting (Enter) is a
// real navigation to a real ?q= search param, matching the URL-driven state
// convention used by RangeTabs — no client JS required to filter the list.
export function SearchForm({ defaultValue }: { defaultValue: string }) {
  return (
    <form action="/dashboard" method="GET" className="mb-4">
      <Input
        type="search"
        name="q"
        placeholder="Search by slug or destination..."
        defaultValue={defaultValue}
        className="max-w-sm"
      />
    </form>
  );
}
