"use client";

import { erc20Abi, maxUint256, zeroAddress, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { KNOWN_TOKENS, SAFETYNET_ADDRESS } from "@/lib/config";
import { useTx } from "@/hooks/use-tx";

const REFETCH_MS = 12_000;

/** ERC20 symbol + decimals (cached forever; falls back to known tokens). */
export function useTokenInfo(token: Address | undefined) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
    ],
    query: { enabled: Boolean(token), staleTime: Infinity },
  });

  const known = KNOWN_TOKENS.find(
    (t) => t.address.toLowerCase() === token?.toLowerCase(),
  );

  return {
    symbol: (data?.[0]?.result as string | undefined) ?? known?.label ?? "…",
    decimals: (data?.[1]?.result as number | undefined) ?? 18,
    isLoading,
  };
}

/** ERC20 balance of `owner`. */
export function useTokenBalance(
  token: Address | undefined,
  owner: Address | undefined,
) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner ?? zeroAddress],
    query: {
      enabled: Boolean(token) && Boolean(owner),
      refetchInterval: REFETCH_MS,
    },
  });
}

/** ERC20 allowance from `owner` to the SafetyNet contract. */
export function useAllowance(
  token: Address | undefined,
  owner: Address | undefined,
) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner ?? zeroAddress, SAFETYNET_ADDRESS],
    query: {
      enabled: Boolean(token) && Boolean(owner),
      refetchInterval: REFETCH_MS,
    },
  });
}

/** Approve the SafetyNet contract to spend `token` (defaults to unlimited). */
export function useApprove() {
  const tx = useTx();
  const approve = (token: Address, amount: bigint = maxUint256) =>
    tx.run({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [SAFETYNET_ADDRESS, amount],
    });
  return { approve, ...tx };
}
