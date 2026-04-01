"use client";

import { FundStatus, getStatusColor } from "@/lib/get-fund-status";
import { Caption } from "@breadcoop/ui";

export function StatusBadge({ status }: { status: FundStatus }) {
  const label = status
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}
    >
      <Caption>{label}</Caption>
    </span>
  );
}
