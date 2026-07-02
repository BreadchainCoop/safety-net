"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { hashFn } from "wagmi/query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { erc20Abi } from "viem";
import { BreadUIKitProvider, ConnectedUserProvider } from "@breadcoop/ui";
import { wagmiConfig } from "@/lib/wagmi";
import { BREAD_ADDRESS, CHAIN_ID } from "@/lib/config";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session; hashFn keeps bigint query keys stable.
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "#286b63", // primary-jade
            accentColorForeground: "#f6f3eb", // paper-main
            borderRadius: "medium",
          })}
        >
          {/* Kit context ("general" = wagmi/RainbowKit auth, no Privy) —
              required by the kit Navbar account section and CopyButtonIcon. */}
          <BreadUIKitProvider
            app="net"
            chainId={CHAIN_ID}
            authProvider="general"
            tokenConfig={{ BREAD: { address: BREAD_ADDRESS, abi: erc20Abi } }}
          >
            <ConnectedUserProvider>{children}</ConnectedUserProvider>
          </BreadUIKitProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
