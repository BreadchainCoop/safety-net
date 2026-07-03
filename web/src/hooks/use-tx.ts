"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi, Address } from "viem";
import { CHAIN_ID } from "@/lib/config";
import { parseContractError } from "@/lib/parse-contract-error";

export type TxStatus = "idle" | "signing" | "confirming" | "success" | "error";

/** A contract write request (loosely typed; validated against the ABI at runtime by viem). */
export interface TxRequest {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

/**
 * Standard write → wait-for-receipt flow used by every action in the dapp.
 * `run(request)` submits a contract write and resolves with the tx hash;
 * `status`, `hash`, and `error` drive the UI. On success every on-chain read
 * in the app is invalidated so balances/lists refresh immediately.
 */
export function useTx() {
  const {
    writeContractAsync,
    data: hash,
    isPending: isSigning,
    reset: resetWrite,
  } = useWriteContract();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID });

  useEffect(() => {
    if (!isSuccess) return;
    // Refresh every useReadContract / useReadContracts in the app.
    queryClient.invalidateQueries({ queryKey: ["readContract"] });
    queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }, [isSuccess, queryClient]);

  const run = useCallback(
    async (request: TxRequest): Promise<`0x${string}` | undefined> => {
      setSubmitError(null);
      try {
        return await writeContractAsync(
          request as Parameters<typeof writeContractAsync>[0],
        );
      } catch (e) {
        setSubmitError(parseContractError(e));
        return undefined;
      }
    },
    [writeContractAsync],
  );

  const reset = useCallback(() => {
    setSubmitError(null);
    resetWrite();
  }, [resetWrite]);

  const status: TxStatus = submitError
    ? "error"
    : isSuccess
      ? "success"
      : isConfirming
        ? "confirming"
        : isSigning
          ? "signing"
          : "idle";

  return {
    run,
    reset,
    hash,
    /** Confirmed receipt (for parsing emitted events on success). */
    receipt,
    status,
    isBusy: isSigning || isConfirming,
    isSuccess,
    error:
      submitError ?? (receiptError ? parseContractError(receiptError) : null),
  };
}

export type Tx = ReturnType<typeof useTx>;
