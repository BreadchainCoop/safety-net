import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import {
  ADDRESSES,
  ADDRESSES_ENV_PINNED,
  ADDRESSES_URL,
  BASE_PATH,
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
 * Same-origin note: on GitHub Pages the app is served from breadchaincoop.
 * github.io, and fetching the manifest cross-origin from the GitHub *release
 * asset* fails — the asset download 302-redirects to
 * release-assets.githubusercontent.com, which omits `Access-Control-Allow-
 * Origin`, so the browser blocks it. Instead, `scripts/fetch-addresses.mjs`
 * pulls the manifest server-side at build time and writes it to
 * `public/addresses.json`; the client then fetches it from its OWN origin
 * (`${BASE_PATH}/addresses.json`) — no CORS hop. A contract-only redeploy now
 * needs a Pages rebuild to surface (the workflow can trigger one); the
 * `NEXT_PUBLIC_ADDRESSES_URL` override still bypasses this for previews.
 */

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

/**
 * Fetch the manifest — direct URL override, or the build-shipped same-origin
 * `public/addresses.json` (written by scripts/fetch-addresses.mjs). The browser
 * only ever talks to our own origin, so there's no cross-origin/CORS hop.
 */
async function fetchManifest(): Promise<unknown> {
  if (ADDRESSES_URL && ADDRESSES_URL !== "off") {
    return fetchJson(ADDRESSES_URL);
  }
  return fetchJson(`${BASE_PATH}/addresses.json`);
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
