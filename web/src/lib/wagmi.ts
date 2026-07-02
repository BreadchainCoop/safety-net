import { fallback, http, createConfig, type CreateConnectorFn } from "wagmi";
import { gnosis } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import {
  CHAIN,
  RPC_URL,
  VERIFY_MODE,
  VERIFY_PRIVATE_KEY,
  WALLETCONNECT_PROJECT_ID,
} from "@/lib/config";
import { devWalletConnector } from "@/lib/dev-wallet";

/**
 * wagmi + RainbowKit config. Single chain (Gnosis). Injected wallets work out
 * of the box; WalletConnect activates with a real project id. safeWallet is
 * included because groups may operate from Safes. In verify mode an extra
 * private-key-backed "Dev Wallet" connector is appended (connected via the
 * VERIFY MODE banner, outside the RainbowKit modal).
 */
const walletConnectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        injectedWallet,
        metaMaskWallet,
        rabbyWallet,
        walletConnectWallet,
        safeWallet,
      ],
    },
  ],
  { appName: "Safety Net", projectId: WALLETCONNECT_PROJECT_ID },
);

// In verify mode the dev wallet is the ONLY connector: extension-wallet SDK
// connectors (WalletConnect, MetaMask SDK) can hang in getProvider() during
// wagmi's reconnect-on-mount, leaving the app stuck in "connecting" forever.
const connectors: CreateConnectorFn[] =
  VERIFY_MODE && VERIFY_PRIVATE_KEY
    ? [
        devWalletConnector({
          privateKey: VERIFY_PRIVATE_KEY,
          chain: CHAIN,
          rpcUrl: RPC_URL,
        }),
      ]
    : [...walletConnectors];

export const wagmiConfig = createConfig({
  chains: [gnosis],
  connectors,
  // In verify mode, skip EIP-6963 discovery of browser-extension providers:
  // a discovered extension connector can stall wagmi's reconnect-on-mount,
  // leaving the app stuck in "connecting" and the dev wallet unusable.
  ...(VERIFY_MODE ? { multiInjectedProviderDiscovery: false } : {}),
  // Multi-provider fallback (crowdstaking-v2 pattern): if the primary RPC
  // hiccups, reads fail over instead of blanking the whole app.
  transports: {
    [gnosis.id]: fallback([
      http(RPC_URL, { timeout: 7_000, retryCount: 1 }),
      http("https://1rpc.io/gnosis", { timeout: 7_000, retryCount: 1 }),
      http("https://gnosis-mainnet.public.blastapi.io", {
        timeout: 7_000,
        retryCount: 1,
      }),
    ]),
  },
  ssr: true,
});
