"use client";

import { useCallback } from "react";
import { useFundWallet } from "@privy-io/react-auth";
import { useConnectedUser } from "@breadcoop/ui";
import { CHAIN_ID } from "@/lib/config";

/**
 * Privy fiat/onramp for topping up the embedded wallet with native xDAI
 * (app-stacks `use-wallet-funding.ts`, xDAI branch). Once the wallet holds
 * xDAI the user can mint BREAD 1:1 from it.
 *
 * This module is only imported from `use-bread-funding.ts` when `PRIVY_ENABLED`,
 * so `@privy-io/react-auth`'s hook never mounts on the general (RainbowKit) path.
 */
export function useXdaiOnrampPrivy() {
  const { fundWallet } = useFundWallet();
  const { user } = useConnectedUser();
  const address = user.status === "CONNECTED" ? user.address : undefined;

  return useCallback(async () => {
    if (!address) return;
    await fundWallet({
      address,
      options: {
        chain: { id: CHAIN_ID },
        uiConfig: { receiveFundsTitle: "Receive xDAI" },
      },
    });
  }, [fundWallet, address]);
}
