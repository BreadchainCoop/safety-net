"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/config";

/**
 * Route-level error boundary: a render/runtime throw in any page shows this
 * instead of a blank screen, and the raw error is logged (a money app must
 * never fail invisibly). Reset re-renders the segment; the reload link is a
 * hard fallback.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-breadDisplay text-text-standard text-2xl font-bold">
        Something went wrong
      </h1>
      <p className="text-surface-grey-2 mt-3">
        The page hit an unexpected error. Your funds are safe on-chain — this is
        just the interface. Try again, or reload the page.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-primary-jade rounded-xl px-4 py-2 font-bold text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = `${BASE_PATH}/`;
          }}
          className="border-paper-2 text-text-standard rounded-xl border px-4 py-2 font-bold transition-colors hover:border-primary-jade"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
