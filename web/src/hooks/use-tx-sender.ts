"use client";

import { useCallback, useState } from "react";
import { useWriteContract } from "wagmi";
import { CHAIN_ID, PRIVY_ENABLED } from "@/lib/config";
import { useTxSenderPrivy } from "@/hooks/use-tx-sender-privy";
import type { TxRequest } from "@/hooks/use-tx";

/** Uniform tx-sending interface consumed by `useTx`, regardless of auth mode. */
export interface TxSender {
  /** Submit the write; resolves with the tx hash or throws. */
  send: (request: TxRequest) => Promise<`0x${string}` | undefined>;
  /** True while the wallet is signing/submitting (pre-receipt). */
  isSigning: boolean;
  /** Clear any submit-side state. */
  reset: () => void;
}

/**
 * Selects the tx sender for the current auth mode. `PRIVY_ENABLED` is a
 * build-time constant, so exactly one branch is live per build — the
 * conditional hook calls below are statically consistent (React's rules-of-
 * hooks are satisfied because the constant never changes at runtime).
 */
export function useTxSender(): TxSender {
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return usePrivySender();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useWagmiSender();
}

function useWagmiSender(): TxSender {
  const {
    writeContractAsync,
    isPending: isSigning,
    reset,
  } = useWriteContract();

  const send = useCallback(
    async (request: TxRequest): Promise<`0x${string}` | undefined> =>
      writeContractAsync(
        // Pin every write to Gnosis: the wagmi config also includes mainnet
        // (ENS reads only), so a mainnet-connected wallet must be prompted to
        // switch rather than send to the wrong chain.
        {
          chainId: CHAIN_ID,
          ...request,
        } as Parameters<typeof writeContractAsync>[0],
      ),
    [writeContractAsync],
  );

  return { send, isSigning, reset };
}

function usePrivySender(): TxSender {
  const sendSponsored = useTxSenderPrivy();
  const [isSigning, setIsSigning] = useState(false);

  const send = useCallback(
    async (request: TxRequest): Promise<`0x${string}` | undefined> => {
      setIsSigning(true);
      try {
        return await sendSponsored(request);
      } finally {
        setIsSigning(false);
      }
    },
    [sendSponsored],
  );

  const reset = useCallback(() => setIsSigning(false), []);

  return { send, isSigning, reset };
}
