import type { Address, Hex } from "viem";

/**
 * Shared types + constants for the per-net activity feed. Consumed by
 * `@/hooks/use-activity` (data) and `@/components/net/activity-feed` (view).
 */

/** Distinct activity kinds surfaced in the feed. */
export type ActivityType =
  | "created"
  | "started"
  | "member-joined"
  | "deposit"
  | "withdrawal"
  | "request-created"
  | "contested"
  | "vetoed"
  | "executed"
  | "decommissioned";

/** One chronological row in the feed, source-agnostic (logs or subgraph). */
export interface ActivityItem {
  /** Stable dedupe/react key: `${txHash}-${logIndex}` (or synthetic for subgraph rows). */
  id: string;
  type: ActivityType;
  /** Member / redeemer / request owner / tx sender, lowercased 0x address. */
  actor: Address;
  /** Token base-unit amount for deposit/withdrawal/request rows. */
  amount?: bigint;
  /** Free-text reason for request rows. */
  reason?: string;
  /** Onchain request id for request/contest/veto/execute rows. */
  requestId?: bigint;
  txHash: Hex;
  /** Unix seconds. May be 0 until the block timestamp resolves. */
  timestamp: number;
  blockNumber: bigint;
}

/**
 * First block to scan for logs — the block the SafetyNet proxy was deployed at
 * on Gnosis. Scanning from genesis would be needlessly slow.
 */
export const ACTIVITY_FROM_BLOCK = 47000324n;

/**
 * SUBGRAPH ENDPOINT — read here, intentionally, NOT in `@/lib/config`.
 *
 * A concurrent change is integrating Privy in config.ts/providers.tsx, so to
 * avoid an edit conflict this module reads the subgraph URL directly from the
 * environment. When the subgraph is deployed and this var is set, the feed
 * switches from viem event logs to GraphQL automatically. FOLLOW-UP: fold this
 * into `@/lib/config`'s zod-validated env block once the Privy work lands.
 */
export const SUBGRAPH_URL: string | undefined =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL &&
  process.env.NEXT_PUBLIC_SUBGRAPH_URL.length > 0
    ? process.env.NEXT_PUBLIC_SUBGRAPH_URL
    : undefined;

/** Human one-liner describing a row (address rendering is done by the view). */
export function activityVerb(item: ActivityItem): string {
  switch (item.type) {
    case "created":
      return "created this Safety Net";
    case "started":
      return "started the Safety Net";
    case "member-joined":
      return "joined via invite";
    case "deposit":
      return "deposited";
    case "withdrawal":
      return "withdrew";
    case "request-created":
      return "requested a withdrawal";
    case "contested":
      return "contested a withdrawal";
    case "vetoed":
      return "withdrawal was vetoed";
    case "executed":
      return "withdrawal was executed";
    case "decommissioned":
      return "decommissioned the Safety Net";
  }
}

/** Maps a subgraph ActivityType enum value to our local ActivityType. */
export function activityTypeFromSubgraph(raw: string): ActivityType | undefined {
  switch (raw) {
    case "NET_CREATED":
      return "created";
    case "NET_STARTED":
      return "started";
    case "NET_DECOMMISSIONED":
      return "decommissioned";
    case "MEMBER_JOINED":
      return "member-joined";
    case "DEPOSIT":
      return "deposit";
    case "WITHDRAWAL":
      return "withdrawal";
    case "REQUEST_CREATED":
      return "request-created";
    case "REQUEST_CONTESTED":
      return "contested";
    case "REQUEST_VETOED":
      return "vetoed";
    case "REQUEST_EXECUTED":
      return "executed";
    // REQUEST_PENDING / REQUEST_CANCELLED have no dedicated feed row today.
    default:
      return undefined;
  }
}
