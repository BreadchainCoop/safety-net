"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { useMemberDashboard, useSafetyNetNames } from "@/hooks/use-safety-net";
import { requestStatus, type RequestStatus } from "@/lib/types";

const STORAGE_KEY = "safetynet.dismissedNotifications";

export interface RequestNotification {
  /** Stable identity: requestId + the outcome it announces. */
  key: string;
  netId: bigint;
  /** Human-readable net name, when set (else undefined → fall back to #id). */
  netName?: string;
  requestId: bigint;
  status: Exclude<RequestStatus, "contestable">;
  amount: bigint;
  token: Address;
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Issue #24 — on wallet connect, surface the outcomes of the user's own
 * withdrawal requests (vetoed / executed / executable now) as a dismissible
 * banner. Purely client-side: derived from the dashboard read + localStorage
 * for dismissals (keyed by request id + outcome, so a later state change
 * re-notifies).
 */
export function useRequestNotifications() {
  const { address } = useAccount();
  const { data: dashboard } = useMemberDashboard();
  const ids = useMemo(
    () => (dashboard ?? []).map((d) => d.safetyNet.id),
    [dashboard],
  );
  const names = useSafetyNetNames(ids);
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);

  // Read localStorage after mount (static export → no window at build time).
  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const notifications = useMemo<RequestNotification[]>(() => {
    if (!address || !dashboard || !dismissed) return [];
    const me = address.toLowerCase();
    const out: RequestNotification[] = [];
    for (const details of dashboard) {
      for (const view of details.requests) {
        if (view.request.owner.toLowerCase() !== me) continue;
        const status = requestStatus(view);
        if (status === "contestable") continue;
        const key = `${view.id}:${status}`;
        if (dismissed.has(key)) continue;
        out.push({
          key,
          netId: details.safetyNet.id,
          netName: names.get(details.safetyNet.id),
          requestId: view.id,
          status,
          amount: view.request.amount,
          token: details.safetyNet.token,
        });
      }
    }
    return out;
  }, [address, dashboard, dismissed, names]);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev ?? []);
      next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable (private mode) — dismissal lasts for the session
      }
      return next;
    });
  }, []);

  return { notifications, dismiss };
}
