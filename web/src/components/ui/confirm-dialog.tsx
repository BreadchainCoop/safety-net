"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Body, Button, Heading4 } from "@breadcoop/ui";

/**
 * Confirmation step for irreversible actions (decommission, contest) — the
 * app-stacks start-stack-warning pattern: restate the consequence, then an
 * explicit confirm + Cancel. Rendered as a centered modal over a dimmed
 * backdrop; Escape or a backdrop click cancels.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog so keyboard users aren't left behind it.
    confirmRef.current?.querySelector("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={confirmRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="border-paper-2 bg-paper-0 relative w-full max-w-md rounded-2xl border p-6 shadow-xl"
      >
        <div id={titleId}>
          <Heading4 className="text-text-standard">{title}</Heading4>
        </div>
        <Body className="text-surface-grey-2 mt-3 text-sm">{children}</Body>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            app="net"
            variant={destructive ? "destructive" : "primary"}
            className="w-full"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            app="net"
            variant="secondary"
            className="w-full"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
