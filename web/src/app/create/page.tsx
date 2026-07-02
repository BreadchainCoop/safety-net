"use client";

import { PageHeader } from "@/components/ui/ui";
import { CreateForm } from "@/components/create/create-form";

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
