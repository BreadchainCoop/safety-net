"use client";

import { useState, type ReactNode } from "react";
import { hashFn } from "wagmi/query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { erc20Abi } from "viem";
import { gnosis } from "wagmi/chains";
import { BreadUIKitProvider, ConnectedUserProvider } from "@breadcoop/ui";
import { WagmiProvider } from "@privy-io/wagmi";
import {
  PrivyProvider,
  type PrivyClientConfig,
  type WalletListEntry,
} from "@privy-io/react-auth";
import { wagmiConfigPrivy } from "@/lib/wagmi-privy";
import {
  BREAD_ADDRESS,
  CHAIN,
  CHAIN_ID,
  PRIVY_APP_ID,
  PRIVY_CLIENT_ID,
  WALLETCONNECT_PROJECT_ID,
} from "@/lib/config";

// External wallets offered in Privy's own modal (app-stacks appearance.walletList).
const walletList: WalletListEntry[] = [
  "metamask",
  "rainbow",
  "detected_ethereum_wallets",
  "wallet_connect_qr",
];

const privyConfig: PrivyClientConfig = {
  defaultChain: CHAIN,
  supportedChains: [CHAIN],
  // Every login gets an embedded EVM wallet (app-stacks pattern).
  embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
  walletConnectCloudProjectId: WALLETCONNECT_PROJECT_ID,
  appearance: {
    walletList,
    // Match our RainbowKit lightTheme accent (primary-jade). Login methods
    // (email/social) are configured in the Privy dashboard, not here.
    accentColor: "#286b63",
  },
};

/**
 * Privy provider tree (app-stacks `providers/index.tsx` + `web3.tsx`). Mounted
 * only when `PRIVY_ENABLED`. `authProvider="privy"` flips the kit Navbar /
 * LoginButton / ConnectedUser to the embedded-wallet path.
 *
 * Order note: `QueryClientProvider` wraps `WagmiProvider` here (a
 * `@privy-io/wagmi` requirement), the inverse of the general tree.
 */
export function PrivyProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            queryKeyHashFn: hashFn,
          },
        },
      }),
  );

  return (
    <PrivyProvider
      // PRIVY_ENABLED guarantees PRIVY_APP_ID is defined before this mounts.
      appId={PRIVY_APP_ID as string}
      clientId={PRIVY_CLIENT_ID}
      config={privyConfig}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfigPrivy}>
          <RainbowKitProvider
            initialChain={gnosis}
            theme={lightTheme({
              accentColor: "#286b63", // primary-jade
              accentColorForeground: "#f6f3eb", // paper-main
              borderRadius: "medium",
            })}
          >
            <BreadUIKitProvider
              app="net"
              chainId={CHAIN_ID}
              authProvider="privy"
              tokenConfig={{ BREAD: { address: BREAD_ADDRESS, abi: erc20Abi } }}
            >
              <ConnectedUserProvider>{children}</ConnectedUserProvider>
            </BreadUIKitProvider>
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
