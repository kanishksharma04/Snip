import { CreateLinkForm } from "@/components/features/create-link-form";

export default function NewLinkPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">Create a link</h1>
      <CreateLinkForm />
    </div>
  );
}
