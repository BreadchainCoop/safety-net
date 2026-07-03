import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/ui";
import { CreateForm } from "@/components/create/create-form";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Create a Safety Net",
  description:
    "Start a group savings pool with people you trust — set the token, deposits, and withdrawal rules.",
  path: "/create/",
});

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Create a Safety Net"
        subtitle="Set the rules of your group fund — who's in, what everyone contributes, and how withdrawals are approved."
      />
      <CreateForm />
    </div>
  );
}
