"use client";

import { useState } from "react";
import { useEnsAvatar, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { blo } from "blo";
import { normalize } from "viem/ens";
import { CopyButtonIcon } from "@breadcoop/ui";
import type { Address } from "viem";
import { addressUrl } from "@/lib/config";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Truncated address with a blo identicon (recognize members at a glance,
 * crowdstaking-v2 pattern), a copy button (kit CopyButtonIcon), and an
 * explorer link.
 *
 * ENS is resolved non-blockingly against mainnet (mainnet is in the wagmi
 * config for ENS reads only): the hex + blo identicon render immediately, and
 * the ENS name/avatar swap in when they resolve. The copy button and explorer
 * link always use the raw address. wagmi/TanStack dedupes lookups per address
 * across a members list, and staleTime avoids refetch storms on re-render. If
 * the mainnet transport is down the query just errors and the hex fallback
 * stays.
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
  const addr = address as Address;

  const { data: ensName } = useEnsName({
    address: addr,
    chainId: mainnet.id,
    query: { staleTime: 5 * 60_000, gcTime: 24 * 60 * 60_000, retry: 1 },
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ? normalize(ensName) : undefined,
    chainId: mainnet.id,
    query: { enabled: !!ensName, staleTime: 5 * 60_000, retry: 1 },
  });

  // ENS avatar URIs can 404 or point at unreachable hosts — fall back to blo.
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc =
    ensAvatar && !avatarFailed ? ensAvatar : blo(addr);

  const label = ensName ?? shortenAddress(address, chars);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny identicon / remote ENS avatar; next/image adds nothing */}
      <img
        src={avatarSrc}
        alt=""
        aria-hidden
        width={16}
        height={16}
        onError={() => setAvatarFailed(true)}
        className="h-4 w-4 shrink-0 rounded-sm"
      />
      <a
        href={addressUrl(address)}
        target="_blank"
        rel="noreferrer"
        title={address}
        className={cn(
          "hover:text-primary-jade text-sm hover:underline",
          !ensName && "font-mono",
        )}
      >
        {label}
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
