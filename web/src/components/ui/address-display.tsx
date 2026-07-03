"use client";

import { blo } from "blo";
import { CopyButtonIcon } from "@breadcoop/ui";
import type { Address } from "viem";
import { addressUrl } from "@/lib/config";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Truncated address with a blo identicon (recognize members at a glance,
 * crowdstaking-v2 pattern), a copy button (kit CopyButtonIcon), and an
 * explorer link.
 */
export function AddressDisplay({
  address,
  className,
  chars = 4,
}: {
  address: Address | string;
  className?: string;
  chars?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny data-URL identicon; next/image adds nothing */}
      <img
        src={blo(address as Address)}
        alt=""
        aria-hidden
        width={16}
        height={16}
        className="h-4 w-4 shrink-0 rounded-sm"
      />
      <a
        href={addressUrl(address)}
        target="_blank"
        rel="noreferrer"
        title={address}
        className="hover:text-primary-jade font-mono text-sm hover:underline"
      >
        {shortenAddress(address, chars)}
      </a>
      <CopyButtonIcon
        textToCopy={address}
        aria-label={`Copy address ${address}`}
        checkedIconSize={14}
        className="[&>svg]:h-3.5 [&>svg]:w-3.5"
      />
    </span>
  );
}
