"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import { CHAIN_ID, SAFETYNET_ADDRESS } from "@/lib/config";
import {
  ACTIVITY_FROM_BLOCK,
  activityTypeFromSubgraph,
  SUBGRAPH_URL,
  type ActivityItem,
  type ActivityType,
} from "@/lib/activity";

/**
 * `useNetActivity(netId, requestIds)` — a chronological (newest-first) activity
 * feed for one Safety Net.
 *
 * Dual data path:
 *   - DEFAULT (today): viem `getLogs` against the SafetyNet proxy on Gnosis via
 *     wagmi's `usePublicClient`, decoding the events in the ABI. Block
 *     timestamps are resolved with batched, cached `getBlock` calls (many logs
 *     share a block).
 *   - SUBGRAPH (when NEXT_PUBLIC_SUBGRAPH_URL is set): a single GraphQL POST
 *     for `activityItems`, mapped to the same row type. On any error it falls
 *     back to the log path, so a misconfigured/slow subgraph never blanks the
 *     feed.
 *
 * `requestIds` (from useSafetyNetDetails) let us filter the per-REQUEST
 * contest/veto/execute events — those events key on request id, not net id, so
 * they can only be attributed to a net client-side.
 */

const ABI = safetyNetAbi;

// Per-net events whose FIRST indexed topic is the net id.
const NET_EVENTS = [
  { name: "SafetyNetCreated", type: "created" },
  { name: "SafetyNetStarted", type: "started" },
  { name: "InviteRedeemed", type: "member-joined" },
  { name: "FundsDeposited", type: "deposit" },
  { name: "FundsWithdrawn", type: "withdrawal" },
  { name: "SafetyNetDecommissioned", type: "decommissioned" },
] as const satisfies readonly { name: string; type: ActivityType }[];

// RequestCreated indexes (id, safetyNetId): filter on the SECOND topic.
// Per-request lifecycle events index (requestId, owner): filter client-side by
// requestId membership.
const REQUEST_EVENTS = [
  { name: "WithdrawalContested", type: "contested" },
  { name: "WithdrawalVetoed", type: "vetoed" },
  { name: "WithdrawalAutoExecuted", type: "executed" },
] as const satisfies readonly { name: string; type: ActivityType }[];

type RawLog = {
  args: Record<string, unknown>;
  transactionHash: Hex | null;
  logIndex: number | null;
  blockNumber: bigint | null;
};

/** Resolve block timestamps for a set of block numbers, batched + memoized. */
async function resolveTimestamps(
  client: PublicClient,
  blockNumbers: Iterable<bigint>,
): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers)];
  const entries = await Promise.all(
    unique.map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      return [bn, Number(block.timestamp)] as const;
    }),
  );
  return new Map(entries);
}

async function fetchFromLogs(
  client: PublicClient,
  netId: bigint,
  requestIds: readonly bigint[],
): Promise<ActivityItem[]> {
  const requestIdSet = new Set(requestIds.map((r) => r.toString()));

  // One getLogs per event type (a single multi-event getLogs can't express the
  // differing per-event topic filters we need). All run concurrently.
  const netLogs = await Promise.all(
    NET_EVENTS.map(async ({ name, type }) => {
      const event = getAbiItem({ abi: ABI, name }) as never;
      const logs = (await client.getLogs({
        address: SAFETYNET_ADDRESS,
        event,
        args: { id: netId } as never,
        fromBlock: ACTIVITY_FROM_BLOCK,
        toBlock: "latest",
      })) as unknown as RawLog[];
      return logs.map((log) => ({ log, type }));
    }),
  );

  const createdLogs = (await client.getLogs({
    address: SAFETYNET_ADDRESS,
    event: getAbiItem({ abi: ABI, name: "RequestCreated" }) as never,
    args: { safetyNetId: netId } as never,
    fromBlock: ACTIVITY_FROM_BLOCK,
    toBlock: "latest",
  })) as unknown as RawLog[];

  const requestLogs = await Promise.all(
    REQUEST_EVENTS.map(async ({ name, type }) => {
      const event = getAbiItem({ abi: ABI, name }) as never;
      const logs = (await client.getLogs({
        address: SAFETYNET_ADDRESS,
        event,
        fromBlock: ACTIVITY_FROM_BLOCK,
        toBlock: "latest",
      })) as unknown as RawLog[];
      // These events aren't keyed by net id — keep only this net's requests.
      return logs
        .filter((log) =>
          requestIdSet.has(String(log.args.requestId ?? "")),
        )
        .map((log) => ({ log, type }));
    }),
  );

  const tagged = [
    ...netLogs.flat(),
    ...createdLogs.map((log) => ({
      log,
      type: "request-created" as ActivityType,
    })),
    ...requestLogs.flat(),
  ].filter(({ log }) => log.blockNumber !== null && log.transactionHash !== null);

  const timestamps = await resolveTimestamps(
    client,
    tagged.map(({ log }) => log.blockNumber as bigint),
  );

  const items: ActivityItem[] = tagged.map(({ log, type }) => {
    const args = log.args;
    const requestId = args.requestId as bigint | undefined;
    const actor =
      (args.member as Address | undefined) ??
      (args.redeemer as Address | undefined) ??
      (args.owner as Address | undefined) ??
      SAFETYNET_ADDRESS;
    return {
      id: `${log.transactionHash}-${log.logIndex ?? 0}`,
      type,
      actor: actor.toLowerCase() as Address,
      amount: args.amount as bigint | undefined,
      reason: args.reason as string | undefined,
      requestId: requestId ?? (args.id as bigint | undefined),
      txHash: log.transactionHash as Hex,
      timestamp: timestamps.get(log.blockNumber as bigint) ?? 0,
      blockNumber: log.blockNumber as bigint,
    };
  });

  return sortNewestFirst(items);
}

interface SubgraphRow {
  id: string;
  type: string;
  actor: string;
  amount: string | null;
  reason: string | null;
  request: { id: string } | null;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

const SUBGRAPH_QUERY = `
  query NetActivity($net: ID!) {
    activityItems(
      where: { safetyNet: $net }
      orderBy: timestamp
      orderDirection: desc
      first: 200
    ) {
      id
      type
      actor
      amount
      reason
      request { id }
      timestamp
      blockNumber
      transactionHash
    }
  }
`;

async function fetchFromSubgraph(
  url: string,
  netId: bigint,
): Promise<ActivityItem[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: SUBGRAPH_QUERY,
      variables: { net: netId.toString() },
    }),
  });
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: { activityItems?: SubgraphRow[] };
    errors?: unknown;
  };
  if (json.errors) throw new Error("subgraph GraphQL error");

  const rows = json.data?.activityItems ?? [];
  const items: ActivityItem[] = [];
  for (const row of rows) {
    const type = activityTypeFromSubgraph(row.type);
    if (!type) continue;
    items.push({
      id: row.id,
      type,
      actor: row.actor.toLowerCase() as Address,
      amount: row.amount !== null ? BigInt(row.amount) : undefined,
      reason: row.reason ?? undefined,
      requestId: row.request ? BigInt(row.request.id) : undefined,
      txHash: row.transactionHash as Hex,
      timestamp: Number(row.timestamp),
      blockNumber: BigInt(row.blockNumber),
    });
  }
  return sortNewestFirst(items);
}

function sortNewestFirst(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber)
      return a.blockNumber > b.blockNumber ? -1 : 1;
    return b.timestamp - a.timestamp;
  });
}

export interface UseNetActivityResult {
  items: ActivityItem[];
  isLoading: boolean;
  error: unknown;
  /** True when data came from the subgraph rather than the log scan. */
  fromSubgraph: boolean;
}

export function useNetActivity(
  netId: bigint | undefined,
  requestIds: readonly bigint[] = [],
): UseNetActivityResult {
  const client = usePublicClient({ chainId: CHAIN_ID });

  // Stable primitive key so react-query doesn't refetch on array identity churn.
  const requestKey = useMemo(
    () => requestIds.map((r) => r.toString()).join(","),
    [requestIds],
  );

  const query = useQuery({
    queryKey: [
      "net-activity",
      SAFETYNET_ADDRESS,
      netId?.toString() ?? null,
      SUBGRAPH_URL ?? "logs",
      requestKey,
    ],
    enabled: netId !== undefined && client !== undefined,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ items: ActivityItem[]; fromSubgraph: boolean }> => {
      const id = netId as bigint;
      if (SUBGRAPH_URL) {
        try {
          return { items: await fetchFromSubgraph(SUBGRAPH_URL, id), fromSubgraph: true };
        } catch {
          // Fall through to the log path on any subgraph error.
        }
      }
      const items = await fetchFromLogs(client as PublicClient, id, requestIds);
      return { items, fromSubgraph: false };
    },
  });

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    fromSubgraph: query.data?.fromSubgraph ?? false,
  };
}
