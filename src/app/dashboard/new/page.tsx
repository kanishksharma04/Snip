import { CreateLinkForm } from "@/components/features/create-link-form";

export default function NewLinkPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 p-6 duration-500">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Create a link</h1>
      <div className="max-w-md rounded-2xl border p-5 shadow-sm sm:p-6">
        <CreateLinkForm />
      </div>
    </div>
  );
}
