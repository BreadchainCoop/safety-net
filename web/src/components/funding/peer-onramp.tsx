"use client";

import dynamic from "next/dynamic";
import type { Address } from "viem";

/**
 * RAIL 2 — Peer onramp (zkp2p) entry point, static-export-safe.
 *
 * The SDK runtime lives in `./peer-onramp-inner` and is loaded ONLY via
 * `next/dynamic(..., { ssr: false })`, so `@zkp2p/sdk` (ethers/ox + browser
 * extension bridge) is never imported during `output: "export"` static
 * generation.
 *
 * The rail is GATED behind `NEXT_PUBLIC_ZKP2P_ENABLED` (see `PEER_ONRAMP_ENABLED`
 * in fund-hub.tsx): hidden by default so nothing loads/errors unless an operator
 * explicitly opts in. See web/README.md for the required config.
 */

const PeerOnrampInner = dynamic(() => import("./peer-onramp-inner"), {
  ssr: false,
  loading: () => (
    <div className="border-paper-2 bg-paper-main flex h-24 items-center justify-center rounded-xl border">
      <span className="text-surface-grey-2 text-sm">Loading peer onramp…</span>
    </div>
  ),
});

export function PeerOnramp({ address }: { address?: Address }) {
  return <PeerOnrampInner address={address} />;
}
