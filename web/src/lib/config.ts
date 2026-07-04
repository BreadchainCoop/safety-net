import { gnosis } from "wagmi/chains";
import { isAddress, zeroAddress, type Address } from "viem";
import { z } from "zod";

/** The chain the dapp targets (Gnosis mainnet, id 100). */
export const CHAIN = gnosis;
export const CHAIN_ID: number = gnosis.id;

/*//////////////////////////////////////////////////////////////
                    CLIENT ENV (zod-validated)
//////////////////////////////////////////////////////////////*/

/**
 * All client env is validated here (app-stacks env.ts pattern): a var that is
 * present but malformed fails `next build` loudly instead of silently
 * misconfiguring an app that moves real money. Absent vars fall back to
 * working defaults with a console warning.
 *
 * Empty strings (e.g. an unset CI repo var) are treated as absent.
 */
const optional = (value: string | undefined): string | undefined =>
  value && value.length > 0 ? value : undefined;

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SAFETYNET_ADDRESS: z
    .string()
    .refine((v): boolean => isAddress(v), {
      message: "must be a 0x-prefixed checksummed EVM address",
    })
    .optional(),
  NEXT_PUBLIC_RPC_URL: z
    .url({ error: "must be a valid URL" })
    .refine((v) => v.startsWith("http"), {
      message: "must be an http(s) RPC endpoint",
    })
    .optional(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/i, {
      message: "must be a 32-char hex WalletConnect Cloud project id",
    })
    .optional(),
  NEXT_PUBLIC_SITE_URL: z.url({ error: "must be a valid URL" }).optional(),
  // Privy app id (cuid-like). When present (and not in verify mode) the app
  // switches from RainbowKit "general" auth to Privy embedded wallets.
  NEXT_PUBLIC_PRIVY_APP_ID: z
    .string()
    .regex(/^c[a-z0-9]{20,}$/i, {
      message: "must be a Privy app id (cuid-like: c… 20+ chars)",
    })
    .optional(),
  // Optional Privy client id (app-stacks passes it; optional in the SDK).
  NEXT_PUBLIC_PRIVY_CLIENT_ID: z.string().min(1).optional(),
  // Runtime address manifest: "off" disables runtime hydration entirely; an
  // http(s) URL fetches that manifest directly (tests/previews); unset uses
  // the GitHub contract-addresses release (see remote-addresses.ts).
  NEXT_PUBLIC_ADDRESSES_URL: z
    .string()
    .refine((v) => v === "off" || v.startsWith("http"), {
      message: 'must be "off" or an http(s) manifest URL',
    })
    .optional(),
});

const parsedEnv = clientEnvSchema.safeParse({
  NEXT_PUBLIC_SAFETYNET_ADDRESS: optional(
    process.env.NEXT_PUBLIC_SAFETYNET_ADDRESS,
  ),
  NEXT_PUBLIC_RPC_URL: optional(process.env.NEXT_PUBLIC_RPC_URL),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: optional(
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  ),
  NEXT_PUBLIC_SITE_URL: optional(process.env.NEXT_PUBLIC_SITE_URL),
  NEXT_PUBLIC_PRIVY_APP_ID: optional(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
  NEXT_PUBLIC_PRIVY_CLIENT_ID: optional(process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID),
  NEXT_PUBLIC_ADDRESSES_URL: optional(process.env.NEXT_PUBLIC_ADDRESSES_URL),
});

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid NEXT_PUBLIC_* environment variables:\n${details}`);
}

const env = parsedEnv.data;

/** Use `fallback` when the env var is absent, warning loudly in the console. */
function withDefault(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  if (value === undefined) {
    console.warn(`[config] ${name} not set — falling back to ${fallback}`);
    return fallback;
  }
  return value;
}

export const RPC_URL = withDefault(
  env.NEXT_PUBLIC_RPC_URL,
  "https://rpc.gnosischain.com",
  "NEXT_PUBLIC_RPC_URL",
);

export const WALLETCONNECT_PROJECT_ID = withDefault(
  env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  "434ee6dc8c1d49a393ff4130eae2942c",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
);

/**
 * Contract addresses, MUTABLE on purpose (crowdstake.fun pattern): the deploy
 * workflow publishes an addresses.json manifest to the rolling GitHub release
 * `contract-addresses`, and `hydrateRemoteAddresses()` (remote-addresses.ts)
 * updates this object in place at runtime — so a fresh deployment goes live
 * without a frontend rebuild. The values below are baked-in fallbacks (see
 * DEPLOYMENTS.md at the repo root).
 *
 * Read addresses at CALL TIME (`ADDRESSES.safetyNet` inside a handler/render),
 * never capture them at module scope. For wagmi reads, subscribe through
 * `useAddresses()` (addresses-provider.tsx) so queries refetch on hydration.
 */
export const ADDRESSES: { safetyNet: Address; delegated: Address } = {
  safetyNet: withDefault(
    env.NEXT_PUBLIC_SAFETYNET_ADDRESS,
    "0x4b1B21A7983EBEC95575d1dac63Db17Cd7eF6FdE",
    "NEXT_PUBLIC_SAFETYNET_ADDRESS",
  ) as Address,
  // The DelegatedSafetyNet extension (issue #32): members opt into automatic
  // deposits; anyone can then pay their owed dues from a pre-approved allowance.
  delegated: withDefault(
    optional(process.env.NEXT_PUBLIC_DELEGATED_ADDRESS),
    "0x78ac9A4839E94da38F8535e22e64b004afA4e133",
    "NEXT_PUBLIC_DELEGATED_ADDRESS",
  ) as Address,
};

/**
 * Build-time env pins always win over the runtime manifest — verify-mode E2E
 * and preview deployments must stay deterministic.
 */
export const ADDRESSES_ENV_PINNED = {
  safetyNet: env.NEXT_PUBLIC_SAFETYNET_ADDRESS !== undefined,
  delegated: optional(process.env.NEXT_PUBLIC_DELEGATED_ADDRESS) !== undefined,
} as const;

export const ADDRESSES_URL = env.NEXT_PUBLIC_ADDRESSES_URL;

export const isContractConfigured = (): boolean =>
  ADDRESSES.safetyNet !== zeroAddress;

/** Optional base path for project-subpath hosting (GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Canonical site URL for metadata / OG unfurls. */
export const SITE_URL = withDefault(
  env.NEXT_PUBLIC_SITE_URL,
  "https://breadchaincoop.github.io/safety-net",
  "NEXT_PUBLIC_SITE_URL",
);

/*//////////////////////////////////////////////////////////////
                        PROTOCOL CONSTANTS
//////////////////////////////////////////////////////////////*/

/** Known Gnosis tokens offered in the token picker. */
export const WXDAI_ADDRESS: Address =
  "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
export const BREAD_ADDRESS: Address =
  "0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3";

export const KNOWN_TOKENS: { label: string; address: Address }[] = [
  { label: "BREAD", address: BREAD_ADDRESS },
];

/** Default token for new Safety Nets. */
export const DEFAULT_TOKEN = BREAD_ADDRESS;

export const BLOCK_EXPLORER = "https://gnosisscan.io";
export const txUrl = (hash: string) => `${BLOCK_EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${BLOCK_EXPLORER}/address/${a}`;

/** Mirrors SafetyNet.DAYS_IN_A_MONTH — daily withdrawable divisor. */
export const DAYS_IN_A_MONTH = 30n;

/**
 * Support (redeem) ratio bounds, mirroring SafetyNet.MINIMUM/MAXIMUM_REDEEM_RATIO.
 * A member in need can draw up to ratio x their monthly contribution per month.
 * x1 is a pure savings circle; higher ratios are pool-backed solidarity leverage,
 * throttled onchain by the actuarial effective-ratio caps (getEffectiveRedeemRatio).
 */
export const MIN_REDEEM_RATIO = 1;
export const MAX_REDEEM_RATIO = 25;

/**
 * The classic Broodfonds support convention (~22x): EUR 33.75-112.50/month dues
 * map to EUR 750-2,500/month sickness support. Simple-mode default.
 */
export const BROODFONDS_RATIO = 22;

/**
 * Frontend mirror of the contract's group-size risk cap (SafetyNet constants
 * EXPECTED_SICK_SHARE_BPS = 200, RISK_LOADING_Z_CENTI = 165): the effective
 * ratio can't exceed 1 / (p + z*sqrt(p(1-p)/N)) for a group of N. Used to show
 * realistic support numbers on the create page before a net exists onchain.
 */
export function groupRatioCap(memberCount: number): number {
  if (memberCount < 1) return 1;
  const loadingBps = Math.floor(
    (165 * Math.floor(Math.sqrt(Math.floor((200 * 9800) / memberCount)))) / 100,
  );
  return Math.max(1, Math.floor(10_000 / (200 + loadingBps)));
}

/**
 * Mirrors SafetyNet.MAX_PREPAY_EPOCHS — a deposit may prepay dues at most
 * this many epochs beyond the current one.
 */
export const MAX_PREPAY_EPOCHS = 12n;

/*//////////////////////////////////////////////////////////////
                          VERIFY MODE
//////////////////////////////////////////////////////////////*/

/**
 * Verify mode: dev-only wallet built from a private key so E2E onchain tests
 * can run without a browser extension.
 *
 * SECURITY: the private key env var is only read when NODE_ENV is
 * "development" AND NEXT_PUBLIC_VERIFY_MODE is "true". `next build` statically
 * replaces NODE_ENV with "production", so the whole expression constant-folds
 * to `undefined` and the minifier strips the inlined key from every production
 * bundle — even if the build environment has NEXT_PUBLIC_VERIFY_PRIVATE_KEY
 * set by mistake. Keep the key in .env.verify (see .env.verify.example), never
 * in .env / CI variables.
 */
export const VERIFY_PRIVATE_KEY: `0x${string}` | undefined =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_VERIFY_MODE === "true" &&
  process.env.NEXT_PUBLIC_VERIFY_PRIVATE_KEY
    ? (process.env.NEXT_PUBLIC_VERIFY_PRIVATE_KEY as `0x${string}`)
    : undefined;

export const VERIFY_MODE = VERIFY_PRIVATE_KEY !== undefined;

/*//////////////////////////////////////////////////////////////
                          PRIVY MODE
//////////////////////////////////////////////////////////////*/

/**
 * Privy embedded wallets are OPT-IN via NEXT_PUBLIC_PRIVY_APP_ID. When absent
 * (today's default) the app keeps its RainbowKit "general" auth and the
 * verify-mode dev wallet, and the Privy modules never load.
 */
export const PRIVY_APP_ID: string | undefined = env.NEXT_PUBLIC_PRIVY_APP_ID;
export const PRIVY_CLIENT_ID: string | undefined =
  env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

/**
 * Verify mode always wins: the dev-wallet connector and
 * `multiInjectedProviderDiscovery: false` in wagmi.ts conflict with the Privy
 * connector, and E2E must stay deterministic. So Privy is enabled only when an
 * app id is set AND we are not in verify mode.
 */
export const PRIVY_ENABLED = PRIVY_APP_ID !== undefined && !VERIFY_MODE;
