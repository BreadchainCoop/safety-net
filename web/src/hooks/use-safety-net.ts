"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { zeroAddress, type Address } from "viem";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import { CHAIN_ID, isContractConfigured, SAFETYNET_ADDRESS } from "@/lib/config";

/**
 * Data layer for SafetyNet reads. The contract ships aggregate views
 * (getMemberDashboard / getSafetyNetDetails) purpose-built for this frontend,
 * so each page needs exactly one hook. If the aggregate views change shape,
 * refresh the ABI (pnpm generate:abi) — types in @/lib/types are derived from
 * it and every consumer updates automatically.
 */

// chainId is pinned to Gnosis on every contract call: the wagmi config also
// includes mainnet (for ENS reads only), so without this a wallet sitting on
// mainnet could read the wrong chain.
const safetyNetContract = {
  address: SAFETYNET_ADDRESS,
  abi: safetyNetAbi,
  chainId: CHAIN_ID,
} as const;

const REFETCH_MS = 12_000;

/** Aggregated details for every Safety Net the connected wallet has joined. */
export function useMemberDashboard() {
  const { address } = useAccount();
  return useReadContract({
    ...safetyNetContract,
    functionName: "getMemberDashboard",
    args: [address ?? zeroAddress],
    query: {
      enabled: isContractConfigured && Boolean(address),
      refetchInterval: REFETCH_MS,
    },
  });
}

/**
 * Aggregated details of one Safety Net, member-specific fields computed for
 * the connected wallet (or the zero address when browsing disconnected).
 */
export function useSafetyNetDetails(id: bigint | undefined) {
  const { address } = useAccount();
  return useReadContract({
    ...safetyNetContract,
    functionName: "getSafetyNetDetails",
    args: [id ?? 0n, address ?? zeroAddress],
    query: {
      enabled: isContractConfigured && id !== undefined,
      // Keep polling even when the tab is in the background: contest windows
      // can be short, so members must see new requests without a reload.
      refetchInterval: REFETCH_MS,
      refetchIntervalInBackground: true,
    },
  });
}

/** Which of the given requests has the connected wallet already contested? */
export function useHasContested(requestIds: readonly bigint[]) {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: requestIds.map((id) => ({
      ...safetyNetContract,
      functionName: "hasContested" as const,
      args: [id, address ?? zeroAddress] as const,
    })),
    query: {
      enabled:
        isContractConfigured && Boolean(address) && requestIds.length > 0,
      refetchInterval: REFETCH_MS,
      refetchIntervalInBackground: true,
    },
  });

  return useMemo(() => {
    const map = new Map<bigint, boolean>();
    requestIds.forEach((id, i) => {
      map.set(id, data?.[i]?.result === true);
    });
    return map;
  }, [data, requestIds]);
}

/** Per-member withdrawable balances of one Safety Net. */
export function useMemberBalances(id: bigint | undefined) {
  return useReadContract({
    ...safetyNetContract,
    functionName: "getMemberBalances",
    args: [id ?? 0n],
    query: {
      enabled: isContractConfigured && id !== undefined,
      refetchInterval: REFETCH_MS,
    },
  });
}

/** Members who still owe dues in the current epoch. */
export function useMembersNeedingDeposit(id: bigint | undefined) {
  return useReadContract({
    ...safetyNetContract,
    functionName: "getMembersNeedingDeposit",
    args: [id ?? 0n],
    query: {
      enabled: isContractConfigured && id !== undefined,
      refetchInterval: REFETCH_MS,
    },
  });
}

/**
 * Deposit-relevant state for an arbitrary member (used by "deposit for
 * another member"): dues left this epoch and whether they're onboarded
 * (monthly contribution set on first deposit).
 */
export function useMemberDepositInfo(
  id: bigint | undefined,
  member: Address | undefined,
) {
  const { data } = useReadContracts({
    contracts: [
      {
        ...safetyNetContract,
        functionName: "duesRemainingThisEpoch" as const,
        args: [id ?? 0n, member ?? zeroAddress] as const,
      },
      {
        ...safetyNetContract,
        functionName: "safetyNetMemberContribute" as const,
        args: [id ?? 0n, member ?? zeroAddress] as const,
      },
      {
        ...safetyNetContract,
        functionName: "isMember" as const,
        args: [id ?? 0n, member ?? zeroAddress] as const,
      },
    ],
    query: {
      enabled: isContractConfigured && id !== undefined && Boolean(member),
      refetchInterval: REFETCH_MS,
    },
  });

  return {
    duesRemaining: data?.[0]?.result as bigint | undefined,
    monthlyContribute: data?.[1]?.result as bigint | undefined,
    isMember: data?.[2]?.result as boolean | undefined,
  };
}

/**
 * The human-readable name of one Safety Net (safetyNetNames mapping). Names
 * are a separate mapping — not part of getSafetyNetDetails/getMemberDashboard —
 * so this is an extra read. May be "" when the owner left it blank.
 */
export function useSafetyNetName(id: bigint | undefined) {
  return useReadContract({
    ...safetyNetContract,
    functionName: "safetyNetNames",
    args: [id ?? 0n],
    query: { enabled: isContractConfigured && id !== undefined },
  });
}

/** Names for many Safety Nets at once (dashboard cards) — batched multicall. */
export function useSafetyNetNames(ids: readonly bigint[]) {
  const { data } = useReadContracts({
    contracts: ids.map((id) => ({
      ...safetyNetContract,
      functionName: "safetyNetNames" as const,
      args: [id] as const,
    })),
    query: { enabled: isContractConfigured && ids.length > 0 },
  });

  return useMemo(() => {
    const map = new Map<bigint, string>();
    ids.forEach((id, i) => {
      const name = data?.[i]?.result;
      if (typeof name === "string" && name.length > 0) map.set(id, name);
    });
    return map;
  }, [data, ids]);
}

/** Whether the protocol allows the given ERC20 for Safety Nets. */
export function useIsTokenAllowed(token: Address | undefined) {
  return useReadContract({
    ...safetyNetContract,
    functionName: "isTokenAllowed",
    args: [token ?? zeroAddress],
    query: { enabled: isContractConfigured && Boolean(token) },
  });
}

/**
 * Batch used-status for the owner's generated invites — live accepted/pending
 * tracking on the invite panel (app-stacks members.tsx pattern: stored links
 * are checked against usedNonces on-chain via a multicall).
 */
export function useInviteNoncesUsed(
  safetyNetId: bigint | undefined,
  nonces: readonly bigint[],
) {
  const { data } = useReadContracts({
    contracts: nonces.map((nonce) => ({
      ...safetyNetContract,
      functionName: "usedNonces" as const,
      args: [safetyNetId ?? 0n, nonce] as const,
    })),
    query: {
      enabled:
        isContractConfigured && safetyNetId !== undefined && nonces.length > 0,
      refetchInterval: REFETCH_MS,
    },
  });

  return useMemo(
    () => nonces.map((_, i) => data?.[i]?.result === true),
    [data, nonces],
  );
}

/** Whether an invite nonce has already been redeemed (join-page pre-check). */
export function useInviteNonceUsed(
  safetyNetId: bigint | undefined,
  nonce: bigint | undefined,
) {
  return useReadContract({
    ...safetyNetContract,
    functionName: "usedNonces",
    args: [safetyNetId ?? 0n, nonce ?? 0n],
    query: {
      enabled:
        isContractConfigured &&
        safetyNetId !== undefined &&
        nonce !== undefined,
      refetchInterval: REFETCH_MS,
    },
  });
}
