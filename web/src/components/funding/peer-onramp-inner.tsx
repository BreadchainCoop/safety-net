"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { Body, Button } from "@breadcoop/ui";
import { ArrowSquareOut } from "@phosphor-icons/react";

/**
 * RAIL 2 — Peer onramp (zkp2p), SDK runtime.
 *
 * CRITICAL: this module statically imports `@zkp2p/sdk` (which pulls ethers/ox
 * and a browser-extension bridge), so it MUST only ever be loaded via
 * `next/dynamic(..., { ssr: false })` from `peer-onramp.tsx` — never during
 * `output: "export"` static generation, and never on the general path.
 *
 * The published SDK (0.7.2) is a bridge to the ZKP2P *browser extension*: it
 * exposes availability/connection/install primitives (`isAvailable`,
 * `getState`, `requestConnection`, `openInstallPage`). The end-to-end
 * fiat→xDAI `onramp()` + `onIntentFulfilled()` flow app-stacks sketched is not
 * present in this published version (it is WIP and commented out upstream), so
 * we implement the real, available path: detect the extension, connect to it,
 * and hand off — guiding the user to install it if missing. Once xDAI lands in
 * the wallet, the hub's post-arrival watcher offers the BREAD mint (same as the
 * bridge/receive rails).
 */
export default function PeerOnrampInner({
  address,
}: {
  address?: Address;
}) {
  const sdkRef = useRef<ReturnType<
    typeof import("@zkp2p/sdk").createPeerExtensionSdk
  > | null>(null);
  const [state, setState] = useState<
    "loading" | "available" | "needs_install" | "connecting" | "connected" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createPeerExtensionSdk } = await import("@zkp2p/sdk");
        if (cancelled) return;
        const sdk = createPeerExtensionSdk({ window });
        sdkRef.current = sdk;
        const available = await sdk.isAvailable();
        if (cancelled) return;
        setState(available ? "available" : "needs_install");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load peer onramp.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = async () => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    setError(null);
    setState("connecting");
    try {
      const approved = await sdk.requestConnection();
      setState(approved ? "connected" : "available");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
      setState("error");
    }
  };

  const install = () => {
    sdkRef.current?.openInstallPage();
  };

  return (
    <div className="border-paper-2 bg-paper-main rounded-xl border p-4">
      <Body className="text-surface-grey-2 text-sm">
        Buy xDAI peer-to-peer via ZKP2P — no KYC, funds land in{" "}
        {address ? "your app wallet" : "your wallet"} on Gnosis. Requires the
        ZKP2P browser extension. Once xDAI arrives you can mint BREAD from it.
      </Body>

      {state === "loading" && (
        <p className="text-surface-grey mt-3 text-sm">Checking for extension…</p>
      )}

      {state === "needs_install" && (
        <Button
          app="net"
          variant="secondary"
          className="mt-3 w-full"
          onClick={install}
        >
          <span className="inline-flex items-center gap-2">
            Install ZKP2P extension <ArrowSquareOut size={16} />
          </span>
        </Button>
      )}

      {(state === "available" || state === "connecting") && (
        <Button
          app="net"
          variant="primary"
          className="mt-3 w-full"
          isLoading={state === "connecting"}
          onClick={connect}
        >
          Connect ZKP2P
        </Button>
      )}

      {state === "connected" && (
        <p className="text-system-green mt-3 text-sm font-medium">
          ZKP2P connected. Continue in the extension to buy xDAI to{" "}
          {address ? "your wallet address" : "your wallet"}.
        </p>
      )}

      {state === "error" && (
        <p className="text-system-red mt-3 text-sm font-medium">
          {error ?? "Peer onramp unavailable."}
        </p>
      )}
    </div>
  );
}
