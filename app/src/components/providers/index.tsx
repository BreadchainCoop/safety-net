"use client";

import { ComponentProps, ReactNode } from "react";
import ToolsProviders from "./tools";
import { Web3Provider } from "./web3";
import { ModalProvider } from "../modal/context";
import { BreadUIKitProvider, ConnectedUserProvider } from "@breadcoop/ui";
import { clientEnv } from "@/lib/env";
import { Address, erc20Abi } from "viem";
import { PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { gnosis } from "viem/chains";
import { foundryChain } from "@/lib/wagmi";

const tokenConfig: ComponentProps<typeof BreadUIKitProvider>["tokenConfig"] = {
  BREAD: {
    address: clientEnv.NEXT_PUBLIC_BREAD_TOKEN_ADDRESS as Address,
    abi: erc20Abi,
  },
};

const _chain =
  clientEnv.NEXT_PUBLIC_NODE_ENV === "production" ? gnosis : foundryChain;

const privyConfig: PrivyClientConfig = {
  defaultChain: _chain,
  supportedChains: [_chain],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
  },
};

const hasPrivy = !!clientEnv.NEXT_PUBLIC_PRIVY_APP_ID;

function FullProviders({ children }: { children: ReactNode }) {
  const isProd = clientEnv.NEXT_PUBLIC_NODE_ENV === "production";

  return (
    <ToolsProviders>
      <PrivyProvider
        appId={clientEnv.NEXT_PUBLIC_PRIVY_APP_ID}
        clientId={clientEnv.NEXT_PUBLIC_PRIVY_CLIENT_ID}
        config={privyConfig}
      >
        <Web3Provider>
          <BreadUIKitProvider
            app="net"
            isProd={isProd}
            tokenConfig={tokenConfig}
            authProvider="privy"
          >
            <ConnectedUserProvider isProd={isProd}>
              <ModalProvider>{children}</ModalProvider>
            </ConnectedUserProvider>
          </BreadUIKitProvider>
        </Web3Provider>
      </PrivyProvider>
    </ToolsProviders>
  );
}

function ShellProviders({ children: _children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="p-8 text-center max-w-md">
        <h1 className="text-2xl font-bold mb-4">Safety Net</h1>
        <p className="text-gray-500 mb-4">
          Set <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_PRIVY_APP_ID</code> and{" "}
          <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_PRIVY_CLIENT_ID</code> in your{" "}
          <code className="bg-gray-100 px-1 rounded">.env</code> file to enable wallet connection.
        </p>
        <p className="text-sm text-gray-400">
          Get these from <a href="https://dashboard.privy.io" className="underline" target="_blank" rel="noopener noreferrer">dashboard.privy.io</a>
        </p>
      </div>
    </div>
  );
}

const Providers = ({ children }: { children: ReactNode }) => {
  if (!hasPrivy) {
    return <ShellProviders>{children}</ShellProviders>;
  }
  return <FullProviders>{children}</FullProviders>;
};

export default Providers;
