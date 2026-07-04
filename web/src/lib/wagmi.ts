import { fallback, http, createConfig, type CreateConnectorFn } from "wagmi";
import { gnosis, mainnet } from "wagmi/chains";
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
/**
 * RainbowKit connectors and multi-RPC transports, shared between the plain
 * wagmi config (below) and the Privy variant in `wagmi-privy.ts`. Exported so
 * the Privy path can reuse the exact same wallet/RPC wiring.
 */
export const walletConnectors = connectorsForWallets(
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

/**
 * Shared chain + transport config. mainnet is present ONLY so ENS reads
 * (useEnsName/useEnsAvatar in AddressDisplay) have a client — all contract
 * reads/writes stay pinned to gnosis via explicit chainId. RainbowKit stays
 * pinned to gnosis (initialChain in providers.tsx), so wallets are still
 * prompted onto Gnosis. Multi-provider fallback (crowdstaking-v2 pattern): if
 * the primary RPC hiccups, reads fail over instead of blanking the whole app.
 */
export const chains = [gnosis, mainnet] as const;

// Gnosis read endpoints, tried in order via wagmi `fallback`. RPC_URL
// (NEXT_PUBLIC_RPC_URL, defaulting to rpc.gnosischain.com) stays primary; the
// rest are verified keyless public endpoints kept intentionally diverse
// (different operators) so one provider being down, rate-limited, or blocked
// on a given network doesn't blank the app. NOTE: this is a static-export dapp
// (next.config `output: "export"`), so there is no server runtime to proxy
// through — the browser talks to these hosts directly. A client whose
// VPN/DNS/ad-blocker null-routes RPC hostnames (ERR_NAME_NOT_RESOLVED) will
// still need a first-party endpoint (private RPC on our own domain) to be
// fully immune; that is infra, not a code change.
export const transports = {
  [gnosis.id]: fallback([
    http(RPC_URL, { timeout: 7_000, retryCount: 1 }),
    http("https://gnosis.drpc.org", { timeout: 7_000, retryCount: 1 }),
    http("https://gnosis-rpc.publicnode.com", {
      timeout: 7_000,
      retryCount: 1,
    }),
    http("https://rpc.gnosis.gateway.fm", { timeout: 7_000, retryCount: 1 }),
  ]),
  // ENS-only public fallback (no key). Reads never write, so no risk.
  [mainnet.id]: fallback([
    http("https://eth.merkle.io", { timeout: 7_000, retryCount: 1 }),
    http("https://ethereum-rpc.publicnode.com", {
      timeout: 7_000,
      retryCount: 1,
    }),
  ]),
} as const;

export const wagmiConfig = createConfig({
  chains,
  connectors,
  // In verify mode, skip EIP-6963 discovery of browser-extension providers:
  // a discovered extension connector can stall wagmi's reconnect-on-mount,
  // leaving the app stuck in "connecting" and the dev wallet unusable.
  ...(VERIFY_MODE ? { multiInjectedProviderDiscovery: false } : {}),
  transports,
  ssr: true,
});
