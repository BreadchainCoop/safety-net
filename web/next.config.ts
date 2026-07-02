import path from "node:path";
import type { NextConfig } from "next";

// Optional base path for project-subpath hosting. Empty for a root domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Pure static export — no server runtime. The dapp talks to Gnosis directly
  // from the browser, so it can be hosted on any static host or IPFS.
  output: "export",
  trailingSlash: true, // each route → directory/index.html (portable on any static host)
  // web/ is self-contained (pnpm) inside a yarn Foundry repo — keep file
  // tracing scoped here so Next doesn't pick the root yarn.lock.
  outputFileTracingRoot: path.join(__dirname),
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  webpack: (config) => {
    // Silence optional-dep resolution warnings from the wallet/web3 tree.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
