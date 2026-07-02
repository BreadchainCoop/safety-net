import { gnosis } from "wagmi/chains";
import { zeroAddress, type Address } from "viem";

/** The chain the dapp targets (Gnosis mainnet, id 100). */
export const CHAIN = gnosis;
export const CHAIN_ID: number = gnosis.id;

/** Treat empty-string env vars (e.g. an unset CI repo var) as absent. */
const envOr = (value: string | undefined, fallback: string): string =>
  value && value.length > 0 ? value : fallback;

export const RPC_URL = envOr(
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://rpc.gnosischain.com",
);

export const WALLETCONNECT_PROJECT_ID = envOr(
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  "safety_net_demo",
);

/**
 * The SafetyNet proxy on Gnosis (see DEPLOYMENTS.md at the repo root).
 * Overridable via NEXT_PUBLIC_SAFETYNET_ADDRESS for other deployments.
 * `isContractConfigured` gates all reads/writes if set to the zero address.
 */
export const SAFETYNET_ADDRESS: Address = envOr(
  process.env.NEXT_PUBLIC_SAFETYNET_ADDRESS,
  "0xD09DBBD3624B3c3F7c48fA9B06A7b124d47C5D0b",
) as Address;

export const isContractConfigured = SAFETYNET_ADDRESS !== zeroAddress;

/** Known Gnosis tokens offered in the token picker. */
export const WXDAI_ADDRESS: Address =
  "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
export const BREAD_ADDRESS: Address =
  "0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3";

export const KNOWN_TOKENS: { label: string; address: Address }[] = [
  { label: "WXDAI", address: WXDAI_ADDRESS },
  { label: "BREAD", address: BREAD_ADDRESS },
];

/** Default token for new Safety Nets. */
export const DEFAULT_TOKEN = WXDAI_ADDRESS;

export const BLOCK_EXPLORER = "https://gnosisscan.io";
export const txUrl = (hash: string) => `${BLOCK_EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${BLOCK_EXPLORER}/address/${a}`;

/** Mirrors SafetyNet.DAYS_IN_A_MONTH — daily withdrawable divisor. */
export const DAYS_IN_A_MONTH = 30n;

/** Redeem ratio bounds (SafetyNet.MINIMUM/MAXIMUM_REDEEM_RATIO). */
export const MIN_REDEEM_RATIO = 1;
export const MAX_REDEEM_RATIO = 22;

/*//////////////////////////////////////////////////////////////
                          VERIFY MODE
//////////////////////////////////////////////////////////////*/

/**
 * Verify mode: dev-only wallet built from a private key so E2E onchain tests
 * can run without a browser extension. Requires BOTH NEXT_PUBLIC_VERIFY_MODE
 * and a private key. Note: only the NEXT_PUBLIC_-prefixed key is inlined into
 * the client bundle by Next; VERIFY_PRIVATE_KEY works for `next dev` server
 * rendering only, so prefer NEXT_PUBLIC_VERIFY_PRIVATE_KEY.
 */
const verifyKey =
  process.env.NEXT_PUBLIC_VERIFY_PRIVATE_KEY || process.env.VERIFY_PRIVATE_KEY;

export const VERIFY_MODE =
  process.env.NEXT_PUBLIC_VERIFY_MODE === "true" && Boolean(verifyKey);

export const VERIFY_PRIVATE_KEY: `0x${string}` | undefined = VERIFY_MODE
  ? (verifyKey as `0x${string}`)
  : undefined;
