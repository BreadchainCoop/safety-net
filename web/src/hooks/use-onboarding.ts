"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * localStorage-backed "has seen the onboarding tour" flag plus open/close
 * controls. First-run detection: if the flag is absent on first mount, we open
 * the tour automatically and stamp it so it never auto-opens again.
 *
 * SSR-safe: `mounted` stays false until the effect runs, so nothing that
 * depends on localStorage renders during hydration (no mismatch). The tour is
 * still manually re-openable via `open()` at any time.
 */
const STORAGE_KEY = "safetynet.onboardingSeen";

export function useOnboarding() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    let seen = true;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // storage unavailable — treat as already seen so we don't nag on every load
    }
    if (!seen) setIsOpen(true);
  }, []);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // storage unavailable — the flag lasts for this session only
    }
  }, []);

  // Manual re-open (e.g. from a "How it works" affordance).
  const open = useCallback(() => setIsOpen(true), []);

  // Close for now, but leave the flag so it can auto-open again if unseen.
  const close = useCallback(() => setIsOpen(false), []);

  // Close and permanently stop auto-opening (Skip / Done).
  const dismiss = useCallback(() => {
    setIsOpen(false);
    markSeen();
  }, [markSeen]);

  return { mounted, isOpen, open, close, dismiss };
}
