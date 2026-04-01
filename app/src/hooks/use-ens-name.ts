"use client";

import { useEnsName } from "wagmi";
import { truncateAddress } from "@/utils/format";

export function useDisplayName(address: string | undefined) {
  const { data: ensName, isLoading } = useEnsName({
    address: address as `0x${string}` | undefined,
    chainId: 1,
    query: {
      enabled: !!address,
      staleTime: Infinity,
    },
  });

  return {
    displayName: ensName ?? (address ? truncateAddress(address) : ""),
    ensName: ensName ?? null,
    isLoading,
  };
}
