"use client";

import { useEffect, useState } from "react";
import {
  ArrowSquareOut,
  CheckCircle,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { txUrl } from "@/lib/config";
import type { TxStatus as TxStatusValue } from "@/hooks/use-tx";

/** After this long "confirming", warn the tx may be stuck (dropped/underpriced). */
const STUCK_AFTER_MS = 120_000;

/**
 * Inline feedback line for a transaction (signing → confirming →
 * success/error). The wrapper is a persistent polite live region so screen
 * readers announce each phase ("Confirm in your wallet…", "Confirmed", …).
 */
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
  // Surface a "may be stuck" hint if a tx sits in "confirming" too long
  // (dropped mempool / underpriced) instead of spinning forever.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (status !== "confirming") {
      setStuck(false);
      return;
    }
    const t = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <div role="status" aria-live="polite">
      {status === "error" && (
        <p className="text-system-red mt-3 flex items-center gap-2 text-sm font-medium">
          <Warning size={18} weight="fill" className="shrink-0" />
          {error ?? "Transaction failed"}
        </p>
      )}

      {status === "success" && (
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
      )}

      {(status === "signing" || status === "confirming") && (
        <p className="text-surface-grey-2 mt-3 flex items-center gap-2 text-sm font-medium">
          <SpinnerGap size={18} className="shrink-0 animate-spin" />
          {status === "signing"
            ? "Confirm in your wallet…"
            : "Waiting for confirmation…"}
        </p>
      )}

      {status === "confirming" && stuck && (
        <p className="text-system-warning mt-2 flex items-center gap-2 text-sm font-medium">
          <Warning size={18} weight="fill" className="shrink-0" />
          Taking longer than usual — check your wallet or try again.
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
      )}
    </div>
  );
}
