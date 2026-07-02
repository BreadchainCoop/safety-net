"use client";

import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Body, Button, Heading4 } from "@breadcoop/ui";
import { CHAIN, CHAIN_ID } from "@/lib/config";
import { Card } from "@/components/ui/ui";

/**
 * Wraps interactive content: prompts to connect when disconnected, and to
 * switch to Gnosis when on the wrong chain. Otherwise renders children.
 */
export function ConnectGate({ children }: { children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <Heading4 className="text-text-standard">Connect your wallet</Heading4>
        <Body className="text-surface-grey-2 max-w-sm">
          Connect a wallet on Gnosis Chain to see your Safety Nets, pay dues,
          and manage withdrawals.
        </Body>
        <ConnectButton />
      </Card>
    );
  }

  if (chainId !== CHAIN_ID) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <Heading4 className="text-text-standard">Wrong network</Heading4>
        <Body className="text-surface-grey-2 max-w-sm">
          Safety Net runs on {CHAIN.name}. Switch networks to continue.
        </Body>
        <Button
          app="net"
          variant="primary"
          isLoading={isPending}
          onClick={() => switchChain({ chainId: CHAIN_ID })}
        >
          Switch to {CHAIN.name}
        </Button>
      </Card>
    );
  }

  return <>{children}</>;
}
