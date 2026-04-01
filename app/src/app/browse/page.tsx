"use client";

import { useState, useEffect } from "react";
import { Heading1, Body } from "@breadcoop/ui";
import { usePublicClient, useReadContract } from "wagmi";
import { parseAbiItem } from "viem";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { FundCard } from "@/components/fund-card";
import { getFundStatus } from "@/lib/get-fund-status";

const PAGE_SIZE = 20;

export default function BrowseFundsPage() {
  const publicClient = usePublicClient();
  const chainId = getDefaultChainId();
  const [fundIds, setFundIds] = useState<bigint[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!publicClient) return;
    const fetchFundIds = async () => {
      try {
        const logs = await publicClient.getLogs({
          address: SAFETY_NET_ADDRESS,
          event: parseAbiItem(
            "event SafetyNetCreated(uint256 indexed id, address owner)"
          ),
          fromBlock: 0n,
          toBlock: "latest",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = logs.map((log: any) => log.args.id as bigint);
        setFundIds(ids);
      } catch {
        // Events may not be available
      } finally {
        setIsLoadingEvents(false);
      }
    };
    fetchFundIds();
  }, [publicClient]);

  const pagedIds = fundIds.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const { data: fundsData, isLoading: fundsLoading } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getSafetyNets",
    args: pagedIds.length > 0 ? [pagedIds] : undefined,
    chainId,
    query: { enabled: pagedIds.length > 0 },
  });

  const isLoading = isLoadingEvents || fundsLoading;
  const funds = fundsData ?? [];
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const totalPages = Math.ceil(fundIds.length / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <Heading1>Browse Funds</Heading1>
        <Body className="text-gray-500">{fundIds.length} total funds</Body>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary-orange border-t-transparent rounded-full" />
        </div>
      ) : funds.length === 0 ? (
        <div className="card-shadow-border rounded-xl p-8 text-center">
          <Body>No funds have been created yet.</Body>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {funds.map((fund) => {
              const status = getFundStatus(
                { safetyNetStart: fund.safetyNetStart, owner: fund.owner },
                false,
                nowSeconds
              );
              return (
                <FundCard
                  key={fund.id.toString()}
                  id={fund.id}
                  owner={fund.owner}
                  token={fund.token}
                  memberCount={fund.members.length}
                  balance={0n}
                  epochDuration={fund.epochDuration}
                  status={status}
                  duesRemaining={0n}
                />
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded bg-paper-1 disabled:opacity-50"
              >
                Previous
              </button>
              <Body className="px-3 py-1">
                Page {page + 1} of {totalPages}
              </Body>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded bg-paper-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
