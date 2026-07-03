"use client";

import { useCallback } from "react";
import { simulateContract } from "@wagmi/core";
import { encodeFunctionData, type Abi } from "viem";
import { useSendTransaction } from "@privy-io/react-auth";
import { useConnectedUser } from "@breadcoop/ui";
import { wagmiConfigPrivy } from "@/lib/wagmi-privy";
import { CHAIN_ID } from "@/lib/config";
import type { TxRequest } from "@/hooks/use-tx";

/**
 * Privy sponsored-tx sender (app-stacks `use-simulate-and-sponsor-tx.ts` +
 * `use-sponsored-tx.ts`):
 *   1. simulate via wagmi to catch reverts before Privy's UI,
 *   2. encode calldata,
 *   3. Privy `sendTransaction` with `{ sponsor: true on Gnosis,
 *      uiOptions: { showWalletUIs: false } }` (silent signing),
 * returning the tx hash so the caller's existing
 * useWaitForTransactionReceipt/invalidation flow is unchanged.
 *
 * This module is only imported from `use-tx-sender.ts` when `PRIVY_ENABLED`,
 * so `@privy-io/react-auth`'s tx hook never mounts on the general path.
 */
export function useTxSenderPrivy() {
  const { sendTransaction } = useSendTransaction();
  const { user } = useConnectedUser();
  const account = user.status === "CONNECTED" ? user.address : undefined;

  return useCallback(
    async (request: TxRequest): Promise<`0x${string}`> => {
      // Simulate first so contract reverts surface before Privy opens. The
      // request is loosely typed (validated at runtime by viem). wagmi's
      // `simulateContract` is generic and infers its Abi type param from the
      // params, which fights a direct cast; view it through a loose call
      // signature instead of using `any`.
      const simulate = simulateContract as unknown as (
        config: typeof wagmiConfigPrivy,
        params: {
          address: `0x${string}`;
          abi: Abi;
          functionName: string;
          args?: readonly unknown[];
          account?: `0x${string}`;
          chainId: number;
          value?: bigint;
        },
      ) => Promise<unknown>;
      await simulate(wagmiConfigPrivy, {
        address: request.address,
        abi: request.abi as Abi,
        functionName: request.functionName,
        args: request.args,
        account,
        chainId: CHAIN_ID,
        value: request.value,
      });

      const data = encodeFunctionData({
        abi: request.abi as Abi,
        functionName: request.functionName,
        args: request.args,
      } as Parameters<typeof encodeFunctionData>[0]);

      const { hash } = await sendTransaction(
        {
          to: request.address,
          data,
          value: request.value,
          chainId: CHAIN_ID,
        },
        {
          // Gas sponsorship is a Privy dashboard setting; the code only opts in
          // on Gnosis. If sponsorship is off there the tx still works, paid
          // from the embedded wallet.
          sponsor: CHAIN_ID === 100,
          uiOptions: { showWalletUIs: false },
        },
      );

      return hash as `0x${string}`;
    },
    [sendTransaction, account],
  );
}
