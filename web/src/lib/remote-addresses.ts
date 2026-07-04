import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import {
  ADDRESSES,
  ADDRESSES_ENV_PINNED,
  ADDRESSES_URL,
  CHAIN_ID,
  VERIFY_MODE,
} from "@/lib/config";

/**
 * Runtime contract-address hydration (crowdstake.fun pattern).
 *
 * The contracts-deploy workflow publishes an addresses.json manifest to the
 * rolling `contract-addresses` GitHub release on every deploy. Because this
 * frontend is a static export (GitHub Pages), fetching that manifest at
 * runtime means fresh deployments go live WITHOUT a frontend rebuild: the
 * baked-in addresses in config.ts become mere fallbacks.
 *
 * Precedence (strongest first):
 *   1. Build-time NEXT_PUBLIC_* env pins (ADDRESSES_ENV_PINNED — verify/E2E)
 *   2. This manifest (latest release)
 *   3. Baked-in fallbacks in config.ts
 *
 * CORS note: plain `github.com/releases/download/...` URLs don't send CORS
 * headers on the redirect, so browsers can't fetch them. api.github.com sends
 * `access-control-allow-origin: *` on every response (including the asset
 * redirect when requested with `Accept: application/octet-stream`), so we go
 * through the API: release-by-tag → asset → download. Both requests are
 * "simple" (no preflight) and anonymous (60 req/h/IP — fine for one fetch per
 * page load).
 */

const REPO = "BreadchainCoop/safety-net";
const RELEASE_TAG = "contract-addresses";
const ASSET_NAME = "addresses.json";
const FETCH_TIMEOUT_MS = 5_000;

const address = z
  .string()
  .refine((v) => isAddress(v, { strict: false }))
  .transform((v) => getAddress(v));

const manifestSchema = z.object({
  version: z.literal(1),
  chains: z.record(
    z.string(),
    z
      .object({
        safetyNet: address.optional(),
        delegatedSafetyNet: address.optional(),
        startBlock: z.number().int().positive().optional(),
        subgraphUrl: z.url().optional(),
      })
      // implementation / proxyAdmin / commit / updatedAt ride along untyped
      .loose(),
  ),
});

/**
 * Manifest-published runtime extras that aren't addresses. `addressChanged`
 * flags that the live proxy differs from the baked default, so consumers of
 * per-address services (the subgraph) can disable stale baked-in endpoints.
 */
export const RUNTIME: {
  subgraphUrl?: string;
  activityFromBlock?: bigint;
  addressChanged: boolean;
} = { addressChanged: false };

function fetchJson(url: string, accept?: string): Promise<unknown> {
  return fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: accept ? { Accept: accept } : undefined,
  }).then((r) => {
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return r.json();
  });
}

/** Fetch the manifest — direct URL override, or via the GitHub API release. */
async function fetchManifest(): Promise<unknown> {
  if (ADDRESSES_URL && ADDRESSES_URL !== "off") {
    return fetchJson(ADDRESSES_URL);
  }
  const release = (await fetchJson(
    `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`,
  )) as { assets?: { name: string; url: string }[] };
  const asset = release.assets?.find((a) => a.name === ASSET_NAME);
  if (!asset) throw new Error(`release has no ${ASSET_NAME} asset`);
  return fetchJson(asset.url, "application/octet-stream");
}

// One in-flight fetch per page load (React StrictMode double-mounts effects in dev).
let inflight: Promise<boolean> | undefined;

/**
 * Fetch the latest published addresses and merge them into {@link ADDRESSES}
 * in place, so call-time reads everywhere pick them up. Fail-soft: on any
 * error the baked-in addresses stay untouched.
 *
 * @returns true if anything was updated (the provider re-renders on that signal).
 */
export function hydrateRemoteAddresses(): Promise<boolean> {
  // Verify mode pins everything for deterministic E2E; "off" is the kill switch.
  if (VERIFY_MODE || ADDRESSES_URL === "off") return Promise.resolve(false);
  if (typeof window === "undefined") return Promise.resolve(false);

  inflight ??= (async () => {
    let raw: unknown;
    try {
      raw = await fetchManifest();
    } catch (e) {
      console.warn("[remote-addresses] using baked-in addresses:", e);
      return false;
    }

    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[remote-addresses] unrecognized manifest — ignoring");
      return false;
    }
    const entry = parsed.data.chains[String(CHAIN_ID)];
    if (!entry) return false;

    let updated = false;
    const apply = (
      key: "safetyNet" | "delegated",
      next: Address | undefined,
      pinned: boolean,
    ) => {
      if (!next || pinned) return;
      if (ADDRESSES[key].toLowerCase() !== next.toLowerCase()) {
        ADDRESSES[key] = next;
        updated = true;
        if (key === "safetyNet") RUNTIME.addressChanged = true;
      }
    };
    apply("safetyNet", entry.safetyNet, ADDRESSES_ENV_PINNED.safetyNet);
    apply("delegated", entry.delegatedSafetyNet, ADDRESSES_ENV_PINNED.delegated);

    if (entry.subgraphUrl) RUNTIME.subgraphUrl = entry.subgraphUrl;
    if (entry.startBlock) RUNTIME.activityFromBlock = BigInt(entry.startBlock);

    return updated;
  })();

  return inflight;
}
