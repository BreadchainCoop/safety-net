"use client";

import { use, useMemo } from "react";
import { useConnectedUser } from "@breadcoop/ui";
import { Heading1, Heading3, Body, Caption, LiftedButton } from "@breadcoop/ui";
import { useReadContract, useReadContracts } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { formatBalance, formatEpochDuration, truncateAddress } from "@/utils/format";
import { getFundStatus } from "@/lib/get-fund-status";
import { StatusBadge } from "@/components/status-badge";
import { MemberTable } from "@/components/member-table";
import { DepositButton } from "@/components/deposit-button";
import { WithdrawForm } from "@/components/withdraw-form";
import { RequestCard } from "@/components/request-card";
import { InviteManager } from "@/components/invite-manager";
import { useModal } from "@/components/modal/context";
import { useSafetyNetTx } from "@/hooks/use-safety-net-tx";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Address, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import { useState, useEffect } from "react";
import { parseContractError } from "@/lib/parse-contract-error";
import { EpochProgress } from "@/components/epoch-progress";
import { useDisplayName } from "@/hooks/use-ens-name";

export default function FundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const fundId = BigInt(id);
  const { user } = useConnectedUser();
  const chainId = getDefaultChainId();
  const { setModal } = useModal();
  const { sendSafetyNetTx } = useSafetyNetTx();
  const queryClient = useQueryClient();
  const router = useRouter();
  const publicClient = usePublicClient();

  const isConnected = user.status === "CONNECTED";
  const address = isConnected ? user.address : undefined;

  // Fetch fund data
  const { data: fund, isLoading } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getSafetyNet",
    args: [fundId],
    chainId,
  });

  // Fetch member balances
  const { data: memberBalancesData } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getMemberBalances",
    args: [fundId],
    chainId,
    query: { enabled: !!fund },
  });

  // Fetch epoch info
  const { data: epochIndex } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getCurrentEpochIndex",
    args: [fundId],
    chainId,
    query: { enabled: !!fund },
  });

  // Fetch dues for each member
  const duesContracts = useMemo(
    () =>
      fund?.members.map((member) => ({
        address: SAFETY_NET_ADDRESS,
        abi: safetyNetAbi,
        functionName: "duesRemainingThisEpoch" as const,
        args: [fundId, member] as const,
        chainId,
      })) ?? [],
    [fund, fundId, chainId]
  );

  const { data: duesResults } = useReadContracts({
    contracts: duesContracts,
    query: { enabled: duesContracts.length > 0 },
  });

  // Fetch decommissionable status
  const { data: isDecommissionable } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "isDecommissionable",
    args: [fundId],
    chainId,
    query: { enabled: !!fund },
  });

  // Fetch contribution to detect first deposit
  const { data: memberContribution } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "safetyNetMemberContribute",
    args: address ? [fundId, address as Address] : undefined,
    chainId,
    query: { enabled: !!address && !!fund },
  });

  const { displayName: ownerName } = useDisplayName(fund?.owner);

  // Fetch request IDs from events
  const [requestIds, setRequestIds] = useState<bigint[]>([]);
  useEffect(() => {
    if (!publicClient || !fund) return;
    const fetchRequests = async () => {
      try {
        const logs = await publicClient.getLogs({
          address: SAFETY_NET_ADDRESS,
          event: parseAbiItem(
            "event RequestCreated(uint256 indexed id, address owner, uint256 timestamp, uint256 amount)"
          ),
          fromBlock: 0n,
          toBlock: "latest",
        });
        // Filter by fund ID - we need to check each request's safetyNetId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = logs.map((log: any) => log.args.id as bigint);
        setRequestIds(ids);
      } catch {
        // Events may not be available on all providers
      }
    };
    fetchRequests();
  }, [publicClient, fund]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="py-20 text-center">
        <Heading3>Fund not found</Heading3>
      </div>
    );
  }

  const [members, balances] = memberBalancesData ?? [[], []];
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const status = getFundStatus(
    { safetyNetStart: fund.safetyNetStart, owner: fund.owner },
    isDecommissionable ?? false,
    nowSeconds
  );

  // Build dues map
  const duesMap = new Map<string, bigint>();
  fund.members.forEach((member, i) => {
    const dues =
      duesResults?.[i]?.status === "success"
        ? (duesResults[i].result as bigint)
        : 0n;
    duesMap.set(member.toLowerCase(), dues);
  });

  // User's balance and dues
  let userBalance = 0n;
  let userDues = 0n;
  if (address) {
    const idx = (members as string[]).findIndex(
      (m) => m.toLowerCase() === address.toLowerCase()
    );
    if (idx >= 0) userBalance = (balances as bigint[])[idx];
    userDues = duesMap.get(address.toLowerCase()) ?? 0n;
  }

  const isMember =
    address &&
    fund.members.some((m) => m.toLowerCase() === address.toLowerCase());
  const isFirstDeposit = memberContribution === 0n;
  const isOwner =
    address && fund.owner.toLowerCase() === address.toLowerCase();

  const epochStartTime = fund.safetyNetStart;
  const currentEpochEnd =
    epochIndex !== undefined
      ? epochStartTime + (epochIndex + 1n) * fund.epochDuration
      : 0n;

  const handleDecommission = async () => {
    try {
      setModal({ type: "DECOMMISSION_LOADING" });
      await sendSafetyNetTx({
        functionName: "decommission",
        args: [fundId],
      });
      setModal({
        type: "DECOMMISSION_RESULT",
        result: "success",
        msg: "Fund decommissioned. Balances returned to members.",
      });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      setTimeout(() => {
        setModal(null);
        router.push("/");
      }, 2000);
    } catch (e) {
      const { message, isUserRejection } = parseContractError(e, "Decommission failed");
      if (isUserRejection) { setModal(null); return; }
      setModal({
        type: "DECOMMISSION_RESULT",
        result: "error",
        msg: message,
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Heading1>Fund #{id}</Heading1>
          <Caption>Owner: {ownerName}</Caption>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Fund Info */}
      <div className="card-shadow-bg rounded-xl p-6">
        <Heading3 className="mb-4">Fund Details</Heading3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InfoItem label="Token" value={truncateAddress(fund.token)} />
          <InfoItem
            label="Members"
            value={`${fund.members.length} / ${fund.maximumMembers.toString()}`}
          />
          <InfoItem
            label="Epoch"
            value={epochIndex?.toString() ?? "0"}
          />
          <InfoItem
            label="Epoch Duration"
            value={formatEpochDuration(fund.epochDuration)}
          />
          <InfoItem
            label="Initial Deposit"
            value={formatBalance(fund.initialDeposit)}
          />
          <InfoItem
            label="Fixed Deposit"
            value={formatBalance(fund.fixedDeposit)}
          />
          <InfoItem
            label="Redeem Ratio"
            value={`${fund.redeemRatio.toString()}x`}
          />
          <InfoItem
            label="Auto Threshold"
            value={formatBalance(fund.autoThreshold)}
          />
          <InfoItem
            label="Consensus"
            value={`${fund.consensusThreshold.toString()}%`}
          />
        </div>
      </div>

      {/* Epoch Progress */}
      {status !== "decommissioned" && status !== "not-started" && epochIndex !== undefined && (
        <EpochProgress
          epochStart={fund.safetyNetStart}
          epochDuration={fund.epochDuration}
          epochIndex={epochIndex}
        />
      )}

      {/* Members */}
      <div className="card-shadow-bg rounded-xl p-6">
        <Heading3 className="mb-4">Members</Heading3>
        <MemberTable
          members={members as string[]}
          balances={balances as bigint[]}
          duesRemaining={duesMap}
          currentUserAddress={address}
        />
      </div>

      {/* Deposit */}
      {isMember && status !== "decommissioned" && (
        <div className="card-shadow-bg rounded-xl p-6">
          <Heading3 className="mb-4">Deposit</Heading3>
          <DepositButton
            fundId={fundId}
            tokenAddress={fund.token as Address}
            fixedDeposit={fund.fixedDeposit}
            initialDeposit={fund.initialDeposit}
            duesRemaining={userDues}
            isFirstDeposit={isFirstDeposit}
          />
        </div>
      )}

      {/* Withdraw */}
      {isMember && status !== "decommissioned" && (
        <div className="card-shadow-bg rounded-xl p-6">
          <Heading3 className="mb-4">Withdraw</Heading3>
          <WithdrawForm
            fundId={fundId}
            fixedDeposit={fund.fixedDeposit}
            redeemRatio={fund.redeemRatio}
            autoThreshold={fund.autoThreshold}
            withdrawableBalance={userBalance}
          />
        </div>
      )}

      {/* Withdrawal Requests */}
      {requestIds.length > 0 && (
        <div className="card-shadow-bg rounded-xl p-6">
          <Heading3 className="mb-4">Withdrawal Requests</Heading3>
          <div className="space-y-3">
            {requestIds.map((reqId) => (
              <RequestCard
                key={reqId.toString()}
                requestId={reqId}
                currentUserAddress={address}
                contestWindow={fund.contestWindow}
                votingWindow={fund.votingWindow}
              />
            ))}
          </div>
        </div>
      )}

      {/* Invites (owner only) */}
      {isOwner && status !== "decommissioned" && (
        <div className="card-shadow-bg rounded-xl p-6">
          <InviteManager fundId={fundId} fundOwner={fund.owner} />
        </div>
      )}

      {/* Decommission */}
      {isDecommissionable && status !== "decommissioned" && (
        <div className="card-shadow-border rounded-xl p-6 border-red-200">
          <Heading3 className="mb-4 text-red-600">Decommission Fund</Heading3>
          <Body className="mb-4">
            This fund is eligible for decommission because a member missed a
            payment. All balances will be returned to members.
          </Body>
          <LiftedButton onClick={handleDecommission} className="bg-red-500! text-white!">
            Decommission Fund
          </LiftedButton>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Caption>{label}</Caption>
      <Body className="font-medium">{value}</Body>
    </div>
  );
}
