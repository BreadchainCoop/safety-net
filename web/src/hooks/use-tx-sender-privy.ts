"use client";

import { useCallback } from "react";
import { simulateContract } from "@wagmi/core";
import { encodeFunctionData, type Abi } from "viem";
import { useSendTransaction } from "@privy-io/react-auth";
import { useConnectedUser } from "@breadcoop/ui";
import { wagmiConfigPrivy } from "@/lib/wagmi-privy";
import { CHAIN, CHAIN_ID, PRIVY_SPONSOR_GAS } from "@/lib/config";
import type { TxRequest } from "@/hooks/use-tx";

/**
 * Privy embedded-wallet tx sender (app-stacks `use-simulate-and-sponsor-tx.ts`):
 *   1. simulate via wagmi to catch reverts before Privy takes over,
 *   2. encode calldata,
 *   3. Privy `sendTransaction`.
 *
 * Gas modes:
 *   - PRIVY_SPONSOR_GAS (default ON): request `sponsor: true` and sign
 *     silently — gasless for the user. Requires, in the Privy dashboard, a
 *     Gnosis gas-sponsorship policy AND "Allow transactions from the client"
 *     enabled; without either, Privy's wallet RPC rejects the client-initiated
 *     send with a 400 (surfaced below as a clear message).
 *   - Unsponsored (NEXT_PUBLIC_PRIVY_SPONSOR_GAS=false): the embedded wallet
 *     pays its own gas. We show the Privy UI and pass a Gnosis
 *     `fundWalletConfig` so a wallet with no xDAI is prompted to fund instead
 *     of failing silently.
 *
 * Returns the tx hash so the caller's existing
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

      // Sponsorship needs a dashboard policy; when off, the wallet self-pays,
      // so keep the Privy UI visible and offer funding on an empty balance.
      const sponsor = PRIVY_SPONSOR_GAS && CHAIN_ID === 100;

      let result: { hash: `0x${string}` };
      try {
        result = await sendTransaction(
          {
            to: request.address,
            data,
            value: request.value,
            chainId: CHAIN_ID,
          },
          sponsor
            ? { sponsor: true, uiOptions: { showWalletUIs: false } }
            : { sponsor: false, fundWalletConfig: { chain: CHAIN } },
        );
      } catch (err) {
        // A 400 from Privy's wallet RPC on a *sponsored* send means the Privy
        // app can't run this client-initiated sponsored transaction — usually
        // "Allow transactions from the client" is off or there's no Gnosis
        // gas-sponsorship policy. Surface something actionable, not the raw 400.
        if (sponsor) {
          throw new Error(
            "Couldn't send the sponsored transaction. In the Privy dashboard, enable Gnosis gas sponsorship and \"Allow transactions from the client\" — or set NEXT_PUBLIC_PRIVY_SPONSOR_GAS=false so the wallet pays its own gas.",
            { cause: err },
          );
        }
        throw err;
      }

      return result.hash as `0x${string}`;
    },
    [sendTransaction, account],
  );
}
