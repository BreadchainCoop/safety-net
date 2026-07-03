"use client";

import { useCallback } from "react";
import { useSignTypedData } from "wagmi";
import type { TypedDataDomain, TypedData } from "viem";
import { PRIVY_ENABLED } from "@/lib/config";
import { useSignTypedDataPrivy } from "@/hooks/use-sign-typed-data-privy";

/** EIP-712 typed-data payload (invites + request authorizations). */
export interface TypedDataParams {
  domain: TypedDataDomain;
  types: TypedData;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Selects the EIP-712 signer for the current auth mode:
 *   - Privy (`PRIVY_ENABLED`): silent embedded-wallet signing (no popup).
 *   - General/verify: wagmi `signTypedData` (RainbowKit wallet / dev wallet).
 *
 * `PRIVY_ENABLED` is a build-time constant, so exactly one hook branch is live
 * per build (rules-of-hooks satisfied — the constant never changes at runtime).
 */
export function useTypedDataSigner(): (
  params: TypedDataParams,
) => Promise<`0x${string}`> {
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSignTypedDataPrivy();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { signTypedDataAsync } = useSignTypedData();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCallback(
    (params: TypedDataParams) =>
      signTypedDataAsync(
        params as Parameters<typeof signTypedDataAsync>[0],
      ),
    [signTypedDataAsync],
  );
}
