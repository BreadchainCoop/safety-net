"use client";

import { Suspense, useState } from "react";
import { useConnectedUser } from "@breadcoop/ui";
import { Heading1, Heading3, Body, LiftedButton, LoginButton } from "@breadcoop/ui";
import { useReadContract, useReadContracts } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { FundCard } from "@/components/fund-card";
import { getFundStatus } from "@/lib/get-fund-status";
import { clientEnv } from "@/lib/env";
import Link from "next/link";
import { Address } from "viem";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardTabs, TabId } from "@/components/dashboard-tabs";
import { Tutorial } from "@/components/tutorial";

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary-orange border-t-transparent rounded-full" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user } = useConnectedUser();
  const isConnected = user.status === "CONNECTED";
  const address = isConnected ? user.address : undefined;
  const chainId = getDefaultChainId();
  const isProd = clientEnv.NEXT_PUBLIC_NODE_ENV === "production";
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = (searchParams.get("tab") as TabId) || "all";

  const handleTabChange = (tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "all") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    router.replace(`?${params.toString()}`);
  };

  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("safetynet-tutorial-seen");
  });

  const handleTutorialComplete = () => {
    localStorage.setItem("safetynet-tutorial-seen", "true");
    setShowTutorial(false);
  };

  const { data: fundIds, isLoading: idsLoading } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getMemberSafetyNets",
    args: address ? [address as Address] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  const { data: fundsData, isLoading: fundsLoading } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getSafetyNets",
    args: fundIds ? [fundIds] : undefined,
    chainId,
    query: { enabled: !!fundIds && fundIds.length > 0 },
  });

  const balanceContracts = fundIds?.map((id) => ({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getMemberBalances" as const,
    args: [id] as const,
    chainId,
  })) ?? [];

  const duesContracts = fundIds?.map((id) => ({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "duesRemainingThisEpoch" as const,
    args: [id, address as Address] as const,
    chainId,
  })) ?? [];

  const decommContracts = fundIds?.map((id) => ({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "isDecommissionable" as const,
    args: [id] as const,
    chainId,
  })) ?? [];

  const withdrawableContracts = fundIds?.map((id) => ({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "memberWithdrawableBalance" as const,
    args: [id, address as Address] as const,
    chainId,
  })) ?? [];

  const { data: balancesData } = useReadContracts({
    contracts: balanceContracts,
    query: { enabled: balanceContracts.length > 0 },
  });

  const { data: duesData } = useReadContracts({
    contracts: duesContracts,
    query: { enabled: duesContracts.length > 0 },
  });

  const { data: decommData } = useReadContracts({
    contracts: decommContracts,
    query: { enabled: decommContracts.length > 0 },
  });

  const { data: withdrawableData } = useReadContracts({
    contracts: withdrawableContracts,
    query: { enabled: withdrawableContracts.length > 0 },
  });

  if (showTutorial && isConnected) {
    return (
      <div className="py-12">
        <Tutorial onComplete={handleTutorialComplete} />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <Heading1>Safety Net</Heading1>
        <Body>Connect your wallet to view your mutual aid funds.</Body>
        <LoginButton app="net" status="NOT_CONNECTED" isProd={isProd} />
      </div>
    );
  }

  const isLoading = idsLoading || fundsLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  const funds = fundsData ?? [];
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  const fundItems = funds.map((fund, i) => {
    const balanceResult = balancesData?.[i];
    const duesResult = duesData?.[i];
    const decommResult = decommData?.[i];
    const withdrawableResult = withdrawableData?.[i];

    let userBalance = 0n;
    if (balanceResult?.status === "success" && address) {
      const [members, balances] = balanceResult.result as [string[], bigint[]];
      const idx = members.findIndex(
        (m) => m.toLowerCase() === address.toLowerCase()
      );
      if (idx >= 0) userBalance = balances[idx];
    }

    const dues =
      duesResult?.status === "success"
        ? (duesResult.result as bigint)
        : 0n;

    const isDecomm =
      decommResult?.status === "success"
        ? (decommResult.result as boolean)
        : false;

    const withdrawable =
      withdrawableResult?.status === "success"
        ? (withdrawableResult.result as bigint)
        : 0n;

    const status = getFundStatus(
      { safetyNetStart: fund.safetyNetStart, owner: fund.owner },
      isDecomm,
      nowSeconds
    );

    return { fund, userBalance, dues, status, withdrawable };
  });

  const counts = {
    all: fundItems.length,
    due: fundItems.filter((f) => f.dues > 0n).length,
    claimable: fundItems.filter((f) => f.withdrawable > 0n).length,
    past: fundItems.filter((f) => f.status === "decommissioned").length,
  };

  const filteredItems = fundItems.filter((f) => {
    switch (activeTab) {
      case "due": return f.dues > 0n;
      case "claimable": return f.withdrawable > 0n;
      case "past": return f.status === "decommissioned";
      default: return true;
    }
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <Heading1>Your Funds</Heading1>
        <Link href="/new">
          <LiftedButton>Create Fund</LiftedButton>
        </Link>
      </div>

      {funds.length === 0 ? (
        <div className="card-shadow-border rounded-xl p-8 text-center">
          <Heading3>No funds yet</Heading3>
          <Body className="mt-2">
            Create a new mutual aid fund or join one via an invite link.
          </Body>
          <div className="mt-6 flex gap-4 justify-center">
            <Link href="/new">
              <LiftedButton>Create Fund</LiftedButton>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <DashboardTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            counts={counts}
          />
          {filteredItems.length === 0 ? (
            <div className="card-shadow-border rounded-xl p-8 text-center">
              <Body>No funds match this filter.</Body>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems.map((item) => (
                <FundCard
                  key={item.fund.id.toString()}
                  id={item.fund.id}
                  owner={item.fund.owner}
                  token={item.fund.token}
                  memberCount={item.fund.members.length}
                  balance={item.userBalance}
                  epochDuration={item.fund.epochDuration}
                  status={item.status}
                  duesRemaining={item.dues}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
