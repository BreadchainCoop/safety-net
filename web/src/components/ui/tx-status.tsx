"use client";

import {
  ArrowSquareOut,
  CheckCircle,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { txUrl } from "@/lib/config";
import type { TxStatus as TxStatusValue } from "@/hooks/use-tx";

/** Inline feedback line for a transaction (signing → confirming → success/error). */
export function TxStatus({
  status,
  hash,
  error,
  successLabel = "Confirmed",
}: {
  status: TxStatusValue;
  hash?: `0x${string}`;
  error?: string | null;
  successLabel?: string;
}) {
  if (status === "idle") return null;

  if (status === "error") {
    return (
      <p className="text-system-red mt-3 flex items-center gap-2 text-sm font-medium">
        <Warning size={18} weight="fill" className="shrink-0" />
        {error ?? "Transaction failed"}
      </p>
    );
  }

  if (status === "success") {
    return (
      <p className="text-system-green mt-3 flex items-center gap-2 text-sm font-medium">
        <CheckCircle size={18} weight="fill" className="shrink-0" />
        {successLabel}
        {hash && (
          <a
            href={txUrl(hash)}
            target="_blank"
            rel="noreferrer"
            className="text-primary-jade inline-flex items-center gap-1 hover:underline"
          >
            View <ArrowSquareOut size={14} />
          </a>
        )}
      </p>
    );
  }

  return (
    <p className="text-surface-grey-2 mt-3 flex items-center gap-2 text-sm font-medium">
      <SpinnerGap size={18} className="shrink-0 animate-spin" />
      {status === "signing"
        ? "Confirm in your wallet…"
        : "Waiting for confirmation…"}
    </p>
  );
}
