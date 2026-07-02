"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import type { Address } from "viem";
import { addressUrl } from "@/lib/config";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Truncated address with a copy button and explorer link. */
export function AddressDisplay({
  address,
  className,
  chars = 4,
}: {
  address: Address | string;
  className?: string;
  chars?: number;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <a
        href={addressUrl(address)}
        target="_blank"
        rel="noreferrer"
        title={address}
        className="hover:text-primary-jade font-mono text-sm hover:underline"
      >
        {shortenAddress(address, chars)}
      </a>
      <button
        type="button"
        title="Copy address"
        onClick={() => {
          navigator.clipboard?.writeText(address).then(() => setCopied(true));
        }}
        className="text-surface-grey hover:text-primary-jade transition-colors"
      >
        {copied ? (
          <Check size={14} weight="bold" className="text-system-green" />
        ) : (
          <Copy size={14} />
        )}
      </button>
    </span>
  );
}
