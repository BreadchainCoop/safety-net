"use client";

import { useCallback } from "react";
import { useSignTypedData } from "@privy-io/react-auth";
import type { TypedDataParams } from "@/hooks/use-typed-data-signer";

/**
 * Recursively convert BigInt values to decimal strings. viem signs typed data
 * locally and accepts BigInt, but Privy ships the payload to its embedded
 * wallet as JSON — and `JSON.stringify` THROWS on BigInt ("Do not know how to
 * serialize a BigInt"), killing e.g. invite generation before any network
 * call. EIP-712 accepts decimal strings for uintN, and the typed-data hash is
 * computed from the semantic value, so signatures are byte-identical.
 */
function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]),
    );
  }
  return value;
}

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
        toJsonSafe(params) as Parameters<typeof signTypedData>[0],
        { uiOptions: { showWalletUIs: false } },
      );
      return signature as `0x${string}`;
    },
    [signTypedData],
  );
}
