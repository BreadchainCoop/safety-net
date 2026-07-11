"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWaitForTransactionReceipt } from "wagmi";
import type { Abi, Address } from "viem";
import { CHAIN_ID } from "@/lib/config";
import { parseContractError } from "@/lib/parse-contract-error";
import { useTxSender } from "@/hooks/use-tx-sender";
import { useToast } from "@/hooks/use-toast";

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
  // Sender is either wagmi `writeContract` (general/verify) or the Privy
  // sponsored path — both resolve with the tx hash so the receipt/invalidation
  // flow below is identical in either mode.
  const { send, isSigning, reset: resetSender } = useTxSender();
  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      setHash(undefined);
      try {
        const txHash = await send(request);
        setHash(txHash);
        return txHash;
      } catch (e) {
        const friendly = parseContractError(e);
        // Always log the raw error: a money app must never fail silently, and a
        // non-contract SDK error (like the Privy BigInt bug) would otherwise
        // collapse into the generic message with no way to diagnose it.
        console.error(`[tx:${request.functionName}] failed:`, e);
        setSubmitError(friendly);
        // A user rejecting the wallet prompt isn't an error worth a toast.
        if (!/rejected in wallet/i.test(friendly)) {
          toast({ tone: "error", message: friendly });
        }
        return undefined;
      }
    },
    [send, toast],
  );

  const reset = useCallback(() => {
    setSubmitError(null);
    setHash(undefined);
    resetSender();
  }, [resetSender]);

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
