import { formatUnits, parseUnits, type Address } from "viem";

/** Format a bigint token amount to a human string with 2–`maxFrac` decimals. */
export function formatAmount(
  value: bigint | undefined,
  decimals = 18,
  maxFrac = 4,
): string {
  if (value === undefined) return "—";
  const s = formatUnits(value, decimals);
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  // A tiny but non-zero amount would round to "0.00" and read as nothing —
  // show a "< smallest" marker instead so it's clearly not zero.
  const smallest = 1 / 10 ** maxFrac;
  if (n > 0 && n < smallest)
    return `<${smallest.toLocaleString("en-US", { maximumFractionDigits: maxFrac })}`;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: n === 0 ? 0 : Math.min(2, maxFrac),
    maximumFractionDigits: maxFrac,
  });
}

/** Parse a user-entered decimal string into a bigint base unit. Returns null on bad input. */
export function parseAmount(input: string, decimals = 18): bigint | null {
  const trimmed = input.trim();
  if (!trimmed || Number.isNaN(Number(trimmed)) || Number(trimmed) < 0)
    return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}

/** 0x1234…abcd */
export function shortenAddress(address?: Address | string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** "3d 4h", "2h 30m", "45s" — human duration for a number of seconds. */
export function formatDuration(seconds: bigint | number): string {
  let s = Math.max(0, Math.floor(Number(seconds)));
  const days = Math.floor(s / 86_400);
  s -= days * 86_400;
  const hours = Math.floor(s / 3_600);
  s -= hours * 3_600;
  const minutes = Math.floor(s / 60);
  s -= minutes * 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${s}s`;
}

/** "in 2d 4h" / "3h ago" — relative time between two unix-second timestamps. */
export function formatRelative(
  target: bigint | number,
  nowSeconds: number,
): string {
  const t = Number(target);
  const delta = t - nowSeconds;
  if (Math.abs(delta) < 5) return "now";
  return delta > 0
    ? `in ${formatDuration(delta)}`
    : `${formatDuration(-delta)} ago`;
}

/** Absolute local date-time, e.g. "Jul 1, 2026, 14:05". */
export function formatDateTime(target: bigint | number): string {
  return new Date(Number(target) * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
