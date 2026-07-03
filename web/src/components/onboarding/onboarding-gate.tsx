"use client";

import { Question } from "@phosphor-icons/react";
import { useOnboarding } from "@/hooks/use-onboarding";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";

/**
 * App-wide onboarding host. Auto-opens the tour once for first-time visitors
 * (localStorage-tracked, SSR-safe via the hook's `mounted` gate) and exposes a
 * subtle floating "How it works" button so anyone can reopen it later —
 * SiteFooter uses the kit's <Footer>, which has no slot for a custom link.
 */
export function OnboardingGate() {
  const { mounted, isOpen, open, close, dismiss } = useOnboarding();

  // Nothing localStorage-dependent renders until mounted, so server and first
  // client render match (no hydration mismatch).
  if (!mounted) return null;

  return (
    <>
      {isOpen && <OnboardingModal onClose={close} onDone={dismiss} />}

      {!isOpen && (
        <button
          type="button"
          onClick={open}
          aria-label="How it works — reopen the intro tour"
          className="border-paper-2 bg-paper-0 text-primary-jade hover:border-primary-jade focus-visible:outline-primary-jade fixed right-4 bottom-4 z-40 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold shadow-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Question size={16} aria-hidden />
          How it works
        </button>
      )}
    </>
  );
}
