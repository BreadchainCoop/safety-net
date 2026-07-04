"use client";

import { zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { delegatedAbi } from "@/lib/abi/delegated";
import { ADDRESSES, CHAIN_ID } from "@/lib/config";
import { useAddresses } from "@/components/addresses-provider";
import { useTx } from "@/hooks/use-tx";

const REFETCH_MS = 12_000;

/**
 * Automatic deposits (DelegatedSafetyNet extension, issue #32).
 *
 * A member opts in by (1) approving the *main proxy* (ADDRESSES.safetyNet) for
 * enough of the net's token to cover future dues, and (2) toggling
 * `setDelegatedDepositsEnabled(true)` on this extension. Then anyone can call
 * `depositIfAllowed(id, member)` to pay that member's owed dues from their
 * allowance. It's opt-in and non-custodial: funds only ever move as dues into
 * nets the member already belongs to, up to their allowance, and the member
 * can revoke by toggling off or reducing the allowance.
 *
 * The token allowance to the proxy is read/written with the existing
 * `useAllowance` / `useApprove` hooks in use-token.ts, which already target
 * the SafetyNet proxy — this hook covers only the delegated-toggle state.
 */

/** Whether `member` has opted into automatic (delegated) deposits. */
export function useDelegatedEnabled(member: Address | undefined) {
  const { delegated } = useAddresses();
  return useReadContract({
    address: delegated,
    abi: delegatedAbi,
    chainId: CHAIN_ID,
    functionName: "isDelegatedDepositsEnabled",
    args: [member ?? zeroAddress],
    query: {
      enabled: Boolean(member),
      refetchInterval: REFETCH_MS,
    },
  });
}

/** Toggle automatic deposits on/off for the connected member. */
export function useToggleDelegated() {
  const tx = useTx();
  const toggle = (enabled: boolean) =>
    tx.run({
      address: ADDRESSES.delegated,
      abi: delegatedAbi,
      functionName: "setDelegatedDepositsEnabled",
      args: [enabled],
    });
  return { toggle, ...tx };
}
