"use client";

import { useEffect, useId, useRef } from "react";
import { FundHub } from "./fund-hub";

/**
 * "Add funds" hub modal. Keeps the original `GetBreadModal({ open, onClose })`
 * API so navbar.tsx / deposit-panel.tsx keep working unchanged; the body is now
 * the full funding hub (LiFi bridge, fiat onramp, receive, and direct BREAD
 * mint) — see fund-hub.tsx.
 *
 * This shell owns the a11y concerns: labelled dialog, Escape-to-close,
 * click-outside, and initial focus.
 */
export function GetBreadModal({
  open,
  onClose,
  prefillMint,
}: {
  open: boolean;
  onClose: () => void;
  /** Shortfall (18 decimals) to prefill the Mint rail with — see FundHub. */
  prefillMint?: bigint;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="border-paper-2 bg-paper-0 relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border p-6 shadow-xl"
      >
        <div id={titleId} className="sr-only">
          Add funds
        </div>
        <FundHub onClose={onClose} prefillMint={prefillMint} />
      </div>
    </div>
  );
}
