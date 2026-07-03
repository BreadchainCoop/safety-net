"use client";

import { useCallback } from "react";
import { useSignTypedData } from "@privy-io/react-auth";
import type { TypedDataParams } from "@/hooks/use-typed-data-signer";

/**
 * Privy EIP-712 signer (app-stacks `stack-result.tsx` pattern): signs typed
 * data silently via `useSignTypedData` from `@privy-io/react-auth` with
 * `uiOptions: { showWalletUIs: false }`, so batch invite generation happens
 * without a wallet popup per signature.
 *
 * Only imported from `use-typed-data-signer.ts` when `PRIVY_ENABLED`.
 */
export function useSignTypedDataPrivy() {
  const { signTypedData } = useSignTypedData();

  return useCallback(
    async (params: TypedDataParams): Promise<`0x${string}`> => {
      const { signature } = await signTypedData(
        params as unknown as Parameters<typeof signTypedData>[0],
        { uiOptions: { showWalletUIs: false } },
      );
      return signature as `0x${string}`;
    },
    [signTypedData],
  );
}
