"use client";

import { useState, type ComponentType } from "react";
import { Caption } from "@breadcoop/ui";
import {
  ArrowLineDown,
  ArrowLineUp,
  Confetti,
  FlagBanner,
  Gavel,
  HandCoins,
  Prohibit,
  SealCheck,
  Sparkle,
  UserPlus,
  type IconProps,
} from "@phosphor-icons/react";
import type { Address } from "viem";
import { AddressDisplay } from "@/components/ui/address-display";
import { TimeDisplay } from "@/components/ui/time-display";
import { Card } from "@/components/ui/ui";
import { useTokenInfo } from "@/hooks/use-token";
import { useNetActivity } from "@/hooks/use-activity";
import { activityVerb, type ActivityItem, type ActivityType } from "@/lib/activity";
import { formatAmount } from "@/lib/format";
import { txUrl } from "@/lib/config";
import type { SafetyNetDetails } from "@/lib/types";

const INITIAL_ROWS = 15;

const ICONS: Record<ActivityType, ComponentType<IconProps>> = {
  created: Sparkle,
  started: FlagBanner,
  "member-joined": UserPlus,
  deposit: ArrowLineDown,
  withdrawal: ArrowLineUp,
  "request-created": HandCoins,
  contested: Gavel,
  vetoed: Prohibit,
  executed: SealCheck,
  decommissioned: Confetti,
};

function truncateReason(reason: string, max = 80): string {
  const clean = reason.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function ActivityRow({
  item,
  symbol,
  decimals,
}: {
  item: ActivityItem;
  symbol: string;
  decimals: number;
}) {
  const Icon = ICONS[item.type];
  const showAmount =
    item.amount !== undefined &&
    (item.type === "deposit" ||
      item.type === "withdrawal" ||
      item.type === "request-created");
  const isRequestScoped =
    item.type === "request-created" ||
    item.type === "contested" ||
    item.type === "vetoed" ||
    item.type === "executed";

  return (
    <li className="border-paper-2 flex gap-3 border-b py-3 last:border-b-0">
      <span className="text-primary-jade mt-0.5 shrink-0">
        <Icon size={18} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-text-standard flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <AddressDisplay address={item.actor as Address} />
          <span className="text-surface-grey-2">{activityVerb(item)}</span>
          {showAmount && (
            <span className="font-breadDisplay text-text-standard font-bold">
              {formatAmount(item.amount, decimals)} {symbol}
            </span>
          )}
          {isRequestScoped && item.requestId !== undefined && (
            <span className="text-surface-grey-2">
              (Request #{item.requestId.toString()})
            </span>
          )}
        </div>

        {item.type === "request-created" &&
          item.reason &&
          item.reason.trim() !== "" && (
            <p className="text-surface-grey mt-1 text-xs italic">
              &ldquo;{truncateReason(item.reason)}&rdquo;
            </p>
          )}

        <div className="text-surface-grey mt-1 flex items-center gap-2 text-xs">
          <TimeDisplay timestamp={item.timestamp} />
          <a
            href={txUrl(item.txHash)}
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary-jade hover:underline"
          >
            tx
          </a>
        </div>
      </div>
    </li>
  );
}

/** Skeleton placeholder rows while the first load resolves. */
function ActivitySkeleton() {
  return (
    <ul className="mt-2 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="border-paper-2 flex gap-3 border-b py-3">
          <span className="bg-paper-2 mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
          <div className="flex-1 space-y-2">
            <div className="bg-paper-2 h-3 w-2/3 rounded" />
            <div className="bg-paper-2 h-2 w-1/4 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Chronological activity feed for one Safety Net. Reads onchain event logs
 * today and the subgraph automatically once NEXT_PUBLIC_SUBGRAPH_URL is set
 * (see `@/hooks/use-activity`).
 */
export function ActivityFeed({ details }: { details: SafetyNetDetails }) {
  const [expanded, setExpanded] = useState(false);
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);

  const requestIds = details.requests.map((r) => r.id);
  const { items, isLoading } = useNetActivity(net.id, requestIds);

  const visible = expanded ? items : items.slice(0, INITIAL_ROWS);
  const hasMore = items.length > INITIAL_ROWS;

  return (
    <Card>
      <Caption className="text-surface-grey-2">Activity</Caption>

      {isLoading && items.length === 0 ? (
        <ActivitySkeleton />
      ) : items.length === 0 ? (
        <p className="text-surface-grey-2 mt-3 text-sm">No activity yet.</p>
      ) : (
        <>
          <ul className="mt-2">
            {visible.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                symbol={symbol}
                decimals={decimals}
              />
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-primary-jade mt-3 text-sm font-medium hover:underline"
            >
              {expanded ? "Show less" : `Show ${items.length - INITIAL_ROWS} more`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
