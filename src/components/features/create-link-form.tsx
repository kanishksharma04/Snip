"use client";

import { useTransition } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createLink } from "@/lib/actions/links";
import { formSchema, type FormInput, type FormOutput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    toast.error("Could not copy to clipboard");
  });
}

// Radix's <Select.Item> rejects an empty-string value (it's reserved
// internally for "nothing selected" / the placeholder state), but "no
// domain selected" is exactly what formSchema's domainId field represents
// with "". This sentinel is a UI-only detail — it never reaches the form's
// actual value.
const DEFAULT_DOMAIN_VALUE = "__default__";

export function CreateLinkForm({
  verifiedDomains = [],
}: {
  verifiedDomains?: { id: string; hostname: string }[];
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { destination: "", customSlug: "", expiresAt: "", domainId: "" },
  });

  const onSubmit: SubmitHandler<FormOutput> = (values) => {
    // Wrapped in startTransition (not just relying on RHF's isSubmitting)
    // because revalidatePath's effect on other Server Components keeps
    // applying after this action's promise resolves — isPending correctly
    // spans that whole window, isSubmitting alone would not.
    startTransition(async () => {
      // Client-side validation here is UX only — it lets the user fix
      // mistakes without a round trip. createLink re-validates every one of
      // these rules server-side, and that's the real security boundary.
      // Do not remove the server-side checks on the assumption this form
      // already covers them.
      const result = await createLink(values);

      if (result.success) {
        toast.success("Link created", {
          description: result.data.shortUrl,
          action: {
            label: "Copy",
            onClick: () => copyToClipboard(result.data.shortUrl),
          },
        });
        form.reset();
        return;
      }

      if (result.field === "customSlug") {
        form.setError("customSlug", { message: result.error });
        return;
      }

      toast.error(result.error);
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-md flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="destination"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination URL</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/very/long/url" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="customSlug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Custom slug (optional)</FormLabel>
              <FormControl>
                <Input placeholder="my-link" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {verifiedDomains.length > 0 && (
          <FormField
            control={form.control}
            name="domainId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Domain (optional)</FormLabel>
                <Select
                  value={field.value || DEFAULT_DOMAIN_VALUE}
                  onValueChange={(value) =>
                    field.onChange(value === DEFAULT_DOMAIN_VALUE ? "" : value)
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={DEFAULT_DOMAIN_VALUE}>Default</SelectItem>
                    {verifiedDomains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.hostname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="expiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expires at (optional)</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Creating…" : "Create link"}
        </Button>
      </form>
    </Form>
  );
}
