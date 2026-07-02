"use client";

import { useAccount, useConnect } from "wagmi";
import { Flask } from "@phosphor-icons/react";
import { VERIFY_MODE } from "@/lib/config";
import { shortenAddress } from "@/lib/format";

/**
 * Dev-only banner shown when verify mode is enabled. Offers a "Connect dev
 * wallet" action that connects the private-key-backed connector — the exact
 * same wagmi pipeline (hooks, components) as a browser-extension wallet.
 */
export function VerifyBanner() {
  const { connect, connectors, isPending } = useConnect();
  const { address, connector: active } = useAccount();

  if (!VERIFY_MODE) return null;

  const devConnector = connectors.find((c) => c.id === "devWallet");
  const devConnected = active?.id === "devWallet";

  return (
    <div className="bg-system-warning flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-xs font-bold text-white">
      <span className="inline-flex items-center gap-1.5">
        <Flask size={14} weight="fill" />
        VERIFY MODE — dev wallet signs real transactions on Gnosis. Never use in
        production.
      </span>
      {devConnector &&
        (devConnected ? (
          <span className="font-mono">
            dev wallet: {shortenAddress(address)}
          </span>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => connect({ connector: devConnector })}
            className="rounded bg-white/20 px-2 py-0.5 uppercase hover:bg-white/30 disabled:opacity-60"
          >
            {isPending ? "Connecting…" : "Connect dev wallet"}
          </button>
        ))}
    </div>
  );
}
