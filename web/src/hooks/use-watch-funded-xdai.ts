"use client";

import { useEffect, useRef } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { CHAIN_ID } from "@/lib/config";

/**
 * Watch a wallet's native xDAI balance and fire `onFunded(delta)` once each
 * time it goes UP (funds arriving from a LiFi route, an onramp, or a plain
 * transfer). Ports app-stacks `use-watch-funded-xdai.ts`, but instead of
 * auto-sponsoring a BREAD mint (this app has no sponsored-tx path) it just
 * surfaces the delta so the caller can OFFER minting via the normal wagmi/Privy
 * `mintBread` flow.
 *
 * Safety:
 *  - only fires on a strict increase, and only once per increase (the ref
 *    advances to the new balance immediately);
 *  - `enabled=false` (or no address) tears the block watcher down, so it never
 *    runs unless the funding hub explicitly turns it on.
 */
export function useWatchFundedXdai(
  address: Address | undefined,
  onFunded: (delta: bigint, newBalance: bigint) => void,
  enabled: boolean,
) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const prevBalance = useRef<bigint | undefined>(undefined);
  // Keep the latest callback without re-subscribing the watcher every render.
  const onFundedRef = useRef(onFunded);
  onFundedRef.current = onFunded;

  useEffect(() => {
    if (!enabled || !address || !publicClient) {
      prevBalance.current = undefined;
      return;
    }

    let cancelled = false;
    publicClient.getBalance({ address }).then((bal) => {
      if (!cancelled && prevBalance.current === undefined) {
        prevBalance.current = bal;
      }
    });

    const unwatch = publicClient.watchBlocks({
      onBlock: async () => {
        const balance = await publicClient.getBalance({ address });
        const prev = prevBalance.current;
        if (prev === undefined) {
          prevBalance.current = balance;
          return;
        }
        if (balance > prev) {
          const delta = balance - prev;
          prevBalance.current = balance; // advance first → fire once per delta
          onFundedRef.current(delta, balance);
        } else if (balance < prev) {
          prevBalance.current = balance;
        }
      },
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  }, [address, publicClient, enabled]);
}
