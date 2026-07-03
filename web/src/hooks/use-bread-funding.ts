"use client";

import { useCallback } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { parseEther, zeroAddress, type Address } from "viem";
import { BREAD_ADDRESS, CHAIN_ID, PRIVY_ENABLED } from "@/lib/config";
import { breadAbi } from "@/lib/abi/bread";
import { useTx } from "@/hooks/use-tx";
import { useXdaiOnrampPrivy } from "@/hooks/use-xdai-onramp-privy";

const REFETCH_MS = 12_000;

/** Reserve a little native xDAI for gas when minting the MAX balance. */
export const GAS_RESERVE_XDAI = parseEther("0.01");

/**
 * "Get BREAD" funding: read the connected wallet's BREAD + native xDAI
 * balances and mint BREAD 1:1 from xDAI.
 *
 * `mintBread` sends native value to BREAD's payable `mint(receiver)` through
 * the app's shared `useTx` path (`TxRequest.value` is carried by both the
 * wagmi and Privy senders), so minting works identically in normal wagmi and
 * Privy-sponsored modes. Mirrors app-stacks `use-auto-bake-bread.ts`.
 *
 * `openOnramp` (Privy only) buys xDAI via Privy's fiat onramp; when Privy is
 * disabled it is `undefined` and minting still works from existing xDAI.
 */
export function useBreadFunding() {
  const { address } = useAccount();

  const breadBalanceQuery = useReadContract({
    address: BREAD_ADDRESS,
    abi: breadAbi,
    chainId: CHAIN_ID,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: Boolean(address), refetchInterval: REFETCH_MS },
  });

  const xdaiBalanceQuery = useBalance({
    address,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: REFETCH_MS },
  });

  const tx = useTx();

  const mintBread = useCallback(
    (xdaiAmount: bigint) => {
      if (!address || xdaiAmount <= 0n) return;
      return tx.run({
        address: BREAD_ADDRESS,
        abi: breadAbi,
        functionName: "mint",
        args: [address as Address],
        value: xdaiAmount,
      });
    },
    [address, tx],
  );

  // `PRIVY_ENABLED` is a build-time constant, so exactly one branch is live per
  // build — the conditional hook call is statically consistent (same pattern as
  // use-tx-sender.ts). The privy module never loads on the general path.
  let openOnramp: (() => Promise<void>) | undefined;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    openOnramp = useXdaiOnrampPrivy();
  }

  return {
    breadBalance: breadBalanceQuery.data as bigint | undefined,
    refetchBreadBalance: breadBalanceQuery.refetch,
    xdaiBalance: xdaiBalanceQuery.data?.value,
    refetchXdaiBalance: xdaiBalanceQuery.refetch,
    mintBread,
    tx,
    openOnramp,
  };
}
