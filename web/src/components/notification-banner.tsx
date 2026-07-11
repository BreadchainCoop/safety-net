"use client";

import Link from "next/link";
import { Bell, X } from "@phosphor-icons/react";
import { useRequestNotifications } from "@/hooks/use-notifications";
import { useTokenInfo } from "@/hooks/use-token";
import { formatAmount } from "@/lib/format";
import type { RequestNotification } from "@/hooks/use-notifications";

const COPY: Record<RequestNotification["status"], string> = {
  vetoed: "was vetoed by your group",
  executed: "has been paid out",
  executable: "passed its contest window — it can be executed now",
};

const TONE: Record<RequestNotification["status"], string> = {
  vetoed: "border-red-1 bg-red-0/60 text-red-main",
  executed: "border-system-green/40 bg-system-green/10 text-system-green",
  executable:
    "border-system-warning/40 bg-system-warning/10 text-system-warning",
};

function NotificationRow({
  notification,
  onDismiss,
}: {
  notification: RequestNotification;
  onDismiss: () => void;
}) {
  const { symbol, decimals } = useTokenInfo(notification.token);
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium ${TONE[notification.status]}`}
    >
      <span className="inline-flex items-center gap-2">
        <Bell size={16} weight="fill" className="shrink-0" />
        <span>
          Your withdrawal request of{" "}
          {formatAmount(notification.amount, decimals)} {symbol}{" "}
          {COPY[notification.status]}.{" "}
          <Link
            href={`/net/?id=${notification.netId}`}
            className="underline underline-offset-2"
          >
            View {notification.netName || `Safety Net #${notification.netId.toString()}`}
          </Link>
        </span>
      </span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}

/**
 * Issue #24 — dismissible banner surfacing outcomes of the connected user's
 * withdrawal requests (vetoed / executed / executable). Client-side only.
 */
export function NotificationBanner() {
  const { notifications, dismiss } = useRequestNotifications();

  if (notifications.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="section-container flex flex-col gap-2 pt-4"
    >
      {notifications.map((n) => (
        <NotificationRow
          key={n.key}
          notification={n}
          onDismiss={() => dismiss(n.key)}
        />
      ))}
    </div>
  );
}
