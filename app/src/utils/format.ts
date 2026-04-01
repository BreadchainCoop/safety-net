import { formatUnits } from "viem";

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatBalance(value: bigint, decimals: number = 18): string {
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatEpochDuration(seconds: bigint): string {
  const days = Number(seconds) / 86400;
  if (days >= 1) return `${days} day${days !== 1 ? "s" : ""}`;
  const hours = Number(seconds) / 3600;
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

export function formatTimeRemaining(targetTimestamp: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (targetTimestamp <= now) return "Expired";
  const remaining = Number(targetTimestamp - now);
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
