"use client";

import type { Address } from "viem";
import { AddressDisplay } from "@/components/ui/address-display";

/**
 * Receive / transfer panel: shows the connected wallet address (ENS + copy +
 * explorer via AddressDisplay) with instructions to send xDAI or BREAD on
 * Gnosis. Mirrors app-stacks' "receive to this address" affordance without a
 * hosted onramp dependency.
 */
export function ReceivePanel({ address }: { address?: Address }) {
  if (!address) {
    return (
      <p className="text-surface-grey-2 text-sm">
        Connect a wallet to see the address to send funds to.
      </p>
    );
  }
  return (
    <div className="border-paper-2 bg-paper-main rounded-xl border p-4">
      <p className="text-surface-grey-2 text-sm">
        Send <strong>xDAI</strong> or <strong>BREAD</strong> on{" "}
        <strong>Gnosis chain</strong> to your wallet address below. Anything on
        another chain must be bridged first (use Transfer crypto above).
      </p>
      <div className="border-paper-2 bg-paper-0 mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
        <AddressDisplay address={address} chars={6} />
      </div>
      <p className="text-surface-grey mt-2 text-xs">
        Once xDAI arrives you can mint BREAD from it below.
      </p>
    </div>
  );
}
