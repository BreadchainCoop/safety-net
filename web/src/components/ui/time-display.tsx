"use client";

import { formatDateTime, formatRelative } from "@/lib/format";
import { useNow } from "@/hooks/use-now";

/** Relative time ("in 2d 4h" / "3h ago") with the absolute time as tooltip. */
export function TimeDisplay({
  timestamp,
  className,
}: {
  timestamp: bigint | number;
  className?: string;
}) {
  const now = useNow();
  return (
    <span className={className} title={formatDateTime(timestamp)}>
      {formatRelative(timestamp, now)}
    </span>
  );
}
