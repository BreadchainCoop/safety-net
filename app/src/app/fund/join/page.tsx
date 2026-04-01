"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Heading1, Heading3, Body, LiftedButton } from "@breadcoop/ui";
import { useConnectedUser } from "@breadcoop/ui";
import { useReadContract } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { useSafetyNetTx } from "@/hooks/use-safety-net-tx";
import { useModal } from "@/components/modal/context";
import { Address } from "viem";
import { truncateAddress, formatBalance } from "@/utils/format";

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useConnectedUser();
  const { sendSafetyNetTx } = useSafetyNetTx();
  const { setModal } = useModal();
  const chainId = getDefaultChainId();
  const [isRedeeming, setIsRedeeming] = useState(false);

  const fundIdParam = searchParams.get("id");
  const nonceParam = searchParams.get("nonce");
  const sigParam = searchParams.get("sig");

  const fundId = fundIdParam ? BigInt(fundIdParam) : undefined;
  const nonce = nonceParam ? BigInt(nonceParam) : undefined;

  const isConnected = user.status === "CONNECTED";
  const address = isConnected ? user.address : undefined;

  // Check if fund exists
  const { data: fund } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "getSafetyNet",
    args: fundId !== undefined ? [fundId] : undefined,
    chainId,
    query: { enabled: fundId !== undefined },
  });

  // Check if already a member
  const { data: alreadyMember } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "isMember",
    args:
      fundId !== undefined && address
        ? [fundId, address as Address]
        : undefined,
    chainId,
    query: { enabled: fundId !== undefined && !!address },
  });

  // Check if nonce is used
  const { data: nonceUsed } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "usedNonces",
    args:
      fundId !== undefined && nonce !== undefined
        ? [fundId, nonce]
        : undefined,
    chainId,
    query: { enabled: fundId !== undefined && nonce !== undefined },
  });

  const handleRedeem = async () => {
    if (!fundId || !nonce || !sigParam) return;
    setIsRedeeming(true);
    try {
      setModal({ type: "DEPOSIT_LOADING" });

      await sendSafetyNetTx({
        functionName: "redeemInvite",
        args: [
          { safetyNetId: fundId, nonce },
          sigParam as `0x${string}`,
        ],
      });

      setModal({
        type: "DEPOSIT_RESULT",
        result: "success",
        msg: "You have joined the fund!",
      });

      setTimeout(() => {
        setModal(null);
        router.push(`/fund/${fundId.toString()}`);
      }, 2000);
    } catch (e) {
      setModal({
        type: "DEPOSIT_RESULT",
        result: "error",
        msg: e instanceof Error ? e.message : "Failed to redeem invite",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  if (!fundIdParam || !nonceParam || !sigParam) {
    return (
      <div className="py-20 text-center">
        <Heading3>Invalid invite link</Heading3>
        <Body className="mt-2">
          The invite link is missing required parameters.
        </Body>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="py-20 text-center">
        <Heading3>Connect your wallet to join this fund.</Heading3>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <Heading1 className="mb-6 text-center">Join Fund</Heading1>

      <div className="card-shadow-bg rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Body className="text-gray-500">Fund ID</Body>
            <Body>{fundIdParam}</Body>
          </div>
          {fund && (
            <>
              <div className="flex justify-between">
                <Body className="text-gray-500">Owner</Body>
                <Body>{truncateAddress(fund.owner)}</Body>
              </div>
              <div className="flex justify-between">
                <Body className="text-gray-500">Members</Body>
                <Body>
                  {fund.members.length} / {fund.maximumMembers.toString()}
                </Body>
              </div>
              <div className="flex justify-between">
                <Body className="text-gray-500">Initial Deposit</Body>
                <Body>{formatBalance(fund.initialDeposit)}</Body>
              </div>
            </>
          )}
        </div>

        {alreadyMember && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <Body className="text-blue-700">
              You are already a member of this fund.
            </Body>
          </div>
        )}

        {nonceUsed && (
          <div className="p-3 bg-red-50 rounded-lg">
            <Body className="text-red-700">
              This invite has already been used.
            </Body>
          </div>
        )}

        {!alreadyMember && !nonceUsed && (
          <LiftedButton
            width="full"
            onClick={handleRedeem}
            disabled={isRedeeming}
          >
            {isRedeeming ? "Joining..." : "Join Fund"}
          </LiftedButton>
        )}

        {alreadyMember && (
          <LiftedButton
            width="full"
            onClick={() => router.push(`/fund/${fundIdParam}`)}
          >
            View Fund
          </LiftedButton>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary-orange border-t-transparent rounded-full" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
