import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);

// Optional base path for project-subpath hosting. Empty for a root domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Allow parallel dev servers (e.g. multi-wallet verify mode) to keep
  // separate build dirs so their NEXT_PUBLIC_* env values don't collide.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Pure static export — no server runtime. The dapp talks to Gnosis directly
  // from the browser, so it can be hosted on any static host or IPFS.
  output: "export",
  trailingSlash: true, // each route → directory/index.html (portable on any static host)
  // web/ is self-contained (pnpm) inside a yarn Foundry repo — keep file
  // tracing scoped here so Next doesn't pick the root yarn.lock.
  outputFileTracingRoot: path.join(__dirname),
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  webpack: (config, { webpack, isServer }) => {
    // Silence optional-dep resolution warnings from the wallet/web3 tree.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    // Polyfill the node builtins the in-browser flu-claim prover pulls in
    // (@zk-email/helpers DKIM verification + snarkjs). CLIENT ONLY — injecting
    // these globals into the server bundle breaks SSR/prerender of other pages.
    // The prover is dynamically imported, so it never bloats the main bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer"),
        punycode: require.resolve("punycode"),
        vm: require.resolve("vm-browserify"),
        fs: false,
        net: false,
        tls: false,
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        }),
        // Some transitive deps import builtins via the `node:` scheme, which
        // resolve.fallback does not intercept — rewrite to the bare specifier
        // so the fallbacks above (or false) apply.
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
