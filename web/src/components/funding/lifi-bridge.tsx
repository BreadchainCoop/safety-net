"use client";

import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Address } from "viem";
import type { Route } from "@lifi/widget";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Button } from "@breadcoop/ui";
import { CHAIN_ID } from "@/lib/config";

/**
 * Static-export-safe entry point for the LiFi cross-chain bridge/swap.
 *
 * CRITICAL: the widget runtime lives in `./lifi-widget-inner` and is loaded
 * ONLY via `next/dynamic(..., { ssr: false })`, so it is never imported during
 * `output: "export"` static generation. If the widget bundle throws at runtime
 * (e.g. an environment it can't initialise in), the error boundary below swaps
 * in a jumper.exchange link-out prefilled for Gnosis — the documented safe
 * fallback.
 */

const LiFiWidgetInner = dynamic(() => import("./lifi-widget-inner"), {
  ssr: false,
  loading: () => (
    <div className="border-paper-2 bg-paper-main flex h-72 items-center justify-center rounded-xl border">
      <span className="text-surface-grey-2 text-sm">Loading bridge…</span>
    </div>
  ),
});

/** Jumper (LiFi's hosted app) prefilled to receive xDAI on Gnosis. */
function jumperUrl(address?: Address) {
  const p = new URLSearchParams({
    toChain: String(CHAIN_ID),
    toToken: "0x0000000000000000000000000000000000000000",
  });
  if (address) p.set("toAddress", address);
  return `https://jumper.exchange/?${p.toString()}`;
}

export function LiFiLinkOut({ address }: { address?: Address }) {
  return (
    <div className="border-paper-2 bg-paper-main rounded-xl border p-4">
      <p className="text-surface-grey-2 text-sm">
        Bridge or swap from any chain into xDAI on Gnosis using Jumper (powered
        by LiFi). It opens in a new tab prefilled for your wallet.
      </p>
      <Button
        app="net"
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => window.open(jumperUrl(address), "_blank", "noopener")}
      >
        <span className="inline-flex items-center gap-2">
          Open Jumper <ArrowSquareOut size={16} />
        </span>
      </Button>
    </div>
  );
}

class WidgetErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[lifi] widget failed, falling back to link-out", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function LiFiBridge({
  address,
  onXdaiRouted,
}: {
  address?: Address;
  onXdaiRouted?: (route: Route) => void;
}) {
  if (!address) return <LiFiLinkOut address={address} />;
  return (
    <WidgetErrorBoundary fallback={<LiFiLinkOut address={address} />}>
      <LiFiWidgetInner address={address} onXdaiRouted={onXdaiRouted} />
    </WidgetErrorBoundary>
  );
}
