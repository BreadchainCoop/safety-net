import { http, createConfig, type CreateConnectorFn } from "wagmi";
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

const connectors: CreateConnectorFn[] = [...walletConnectors];

if (VERIFY_MODE && VERIFY_PRIVATE_KEY) {
  connectors.push(
    devWalletConnector({
      privateKey: VERIFY_PRIVATE_KEY,
      chain: CHAIN,
      rpcUrl: RPC_URL,
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [gnosis],
  connectors,
  transports: {
    [gnosis.id]: http(RPC_URL),
  },
  ssr: true,
});
