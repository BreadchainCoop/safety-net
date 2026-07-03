import { createConfig } from "@privy-io/wagmi";
import { chains, transports, walletConnectors } from "@/lib/wagmi";

/**
 * Privy variant of the wagmi config (app-stacks `web3.tsx` pattern). Uses
 * `createConfig` from `@privy-io/wagmi` — which appends the Privy embedded
 * wallet as a connector on top of the RainbowKit connectors — with the exact
 * same chains/transports/ssr as the general config.
 *
 * This module (and its `@privy-io/wagmi` import) is only ever loaded from the
 * Privy provider tree, which is mounted only when `PRIVY_ENABLED`. On the
 * general/verify path it is never imported, so `@privy-io/wagmi` never loads.
 */
export const wagmiConfigPrivy = createConfig({
  chains,
  connectors: walletConnectors,
  transports,
  ssr: true,
});
