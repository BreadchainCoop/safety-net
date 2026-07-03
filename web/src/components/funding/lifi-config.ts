import type { WidgetConfig } from "@lifi/widget";
import { CHAIN_ID } from "@/lib/config";

/**
 * LiFi widget config, themed to Safety Net's jade palette and locked to
 * Gnosis (chain 100) as the destination so any chain/token routes into xDAI.
 *
 * Mirrors app-stacks `src/components/lifi/config.ts`, but:
 *  - target token is native xDAI (`0x000…0`) on Gnosis — after it lands we
 *    auto-offer minting BREAD (use-watch-funded-xdai), same as app-stacks;
 *  - the theme is recoloured from Breadchain orange to Safety Net jade.
 *
 * Kept as a plain object (no JSX / no widget import that executes) so it can be
 * imported from a static build without pulling the widget runtime in.
 */
export const lifiConfig: Partial<WidgetConfig> = {
  variant: "compact",
  appearance: "light",
  tokens: {
    from: {
      deny: [{ address: "0x0000000000000000000000000000000000000000", chainId: CHAIN_ID }],
    },
  },
  chains: {
    allow: [1, CHAIN_ID, 42161, 8453, 56, 137, 10],
  },
  // Initialize destination to native xDAI on Gnosis.
  toToken: "0x0000000000000000000000000000000000000000",
  toChain: CHAIN_ID,
  disabledUI: { toToken: true },
  theme: {
    colorSchemes: {
      light: {
        palette: {
          primary: { main: "#1f7a5c" },
          secondary: { main: "#8fd0b8" },
          info: { main: "#1f7a5c" },
          background: { default: "#fbfdfb", paper: "#f1f6f2" },
          text: { secondary: "#4a5750" },
          success: { main: "#1f9d5b" },
          error: { main: "#d64545" },
          common: { white: "#f7faf7" },
          grey: { 200: "#808080", 300: "#e2ebe4", 700: "#4a5750", 800: "#6d6d6d" },
        },
      },
    },
    typography: { fontFamily: "Inter, sans-serif" },
    container: {
      boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.08)",
      borderRadius: "1rem",
    },
    shape: { borderRadius: 8 },
  },
};
