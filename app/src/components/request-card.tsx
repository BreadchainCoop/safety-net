"use client";

import { LiftedButton, Body, Caption, Heading4 } from "@breadcoop/ui";
import { formatBalance } from "@/utils/format";
import { useSafetyNetTx } from "@/hooks/use-safety-net-tx";
import { useModal } from "@/components/modal/context";
import { useReadContract } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { Address } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { parseContractError } from "@/lib/parse-contract-error";
import { Countdown } from "./countdown";
import { useDisplayName } from "@/hooks/use-ens-name";

interface RequestCardProps {
  requestId: bigint;
  currentUserAddress?: string;
  contestWindow: bigint;
  votingWindow: bigint;
}

export function RequestCard({
  requestId,
  currentUserAddress,
  contestWindow,
  votingWindow,
}: RequestCardProps) {
  const chainId = getDefaultChainId();
  const { sendSafetyNetTx } = useSafetyNetTx();
  const { setModal } = useModal();
  const queryClient = useQueryClient();

  const { data: request } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "requests",
    args: [requestId],
    chainId,
  });

  const { data: isContested } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "isContested",
    args: [requestId],
    chainId,
  });

  const { data: isExecuted } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "isExecuted",
    args: [requestId],
    chainId,
  });

  const { data: hasVoted } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "requestVotes",
    args:
      currentUserAddress
        ? [requestId, currentUserAddress as Address]
        : undefined,
    chainId,
    query: { enabled: !!currentUserAddress },
  });

  const owner = request ? (request as [string, bigint, bigint, bigint, bigint, bigint])[0] : undefined;
  const { displayName: ownerName } = useDisplayName(owner);

  if (!request) return null;

  const [, , timestamp, yesVotes, noVotes, amount] = request as [
    string, bigint, bigint, bigint, bigint, bigint
  ];

  const now = BigInt(Math.floor(Date.now() / 1000));
  const contestDeadline = timestamp + contestWindow;
  const votingDeadline = timestamp + votingWindow;
  const isOwner = currentUserAddress?.toLowerCase() === owner?.toLowerCase();
  const canContest = !isContested && !isExecuted && now <= contestDeadline && !isOwner;
  const canVote = isContested && !isExecuted && now <= votingDeadline && !hasVoted && !isOwner;
  const canExecute = !isContested && !isExecuted && now > contestDeadline;

  const handleContest = async () => {
    try {
      setModal({ type: "VOTE_LOADING", msg: "Contesting withdrawal..." });
      await sendSafetyNetTx({ functionName: "contest", args: [requestId] });
      setModal({ type: "VOTE_RESULT", result: "success", msg: "Withdrawal contested." });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    } catch (e) {
      const { message, isUserRejection } = parseContractError(e, "Contest failed");
      if (isUserRejection) { setModal(null); return; }
      setModal({ type: "VOTE_RESULT", result: "error", msg: message });
    }
  };

  const handleVote = async (voteValue: boolean) => {
    try {
      setModal({ type: "VOTE_LOADING", msg: `Voting ${voteValue ? "yes" : "no"}...` });
      await sendSafetyNetTx({ functionName: "vote", args: [requestId, voteValue] });
      setModal({ type: "VOTE_RESULT", result: "success", msg: "Vote submitted." });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    } catch (e) {
      const { message, isUserRejection } = parseContractError(e, "Vote failed");
      if (isUserRejection) { setModal(null); return; }
      setModal({ type: "VOTE_RESULT", result: "error", msg: message });
    }
  };

  const handleExecute = async () => {
    try {
      setModal({ type: "VOTE_LOADING", msg: "Executing withdrawal..." });
      await sendSafetyNetTx({ functionName: "executeContestedWithdrawal", args: [requestId] });
      setModal({ type: "VOTE_RESULT", result: "success", msg: "Withdrawal executed." });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    } catch (e) {
      const { message, isUserRejection } = parseContractError(e, "Execution failed");
      if (isUserRejection) { setModal(null); return; }
      setModal({ type: "VOTE_RESULT", result: "error", msg: message });
    }
  };

  return (
    <div className="card-shadow-border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <Heading4>Request #{requestId.toString()}</Heading4>
        {isExecuted ? (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
            Executed
          </span>
        ) : isContested ? (
          <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">
            Contested
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600">
            Pending
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <Caption>Requester</Caption>
          <Body>{ownerName}</Body>
        </div>
        <div className="flex justify-between">
          <Caption>Amount</Caption>
          <Body>{formatBalance(amount)}</Body>
        </div>
        {!isExecuted && !isContested && (
          <div className="flex justify-between items-center">
            <Caption>Contest Window</Caption>
            <Countdown targetTimestamp={contestDeadline} />
          </div>
        )}
        {isContested && !isExecuted && (
          <>
            <div className="flex justify-between items-center">
              <Caption>Voting Deadline</Caption>
              <Countdown targetTimestamp={votingDeadline} />
            </div>
            <div className="flex justify-between">
              <Caption>Votes</Caption>
              <Body>
                Yes: {yesVotes.toString()} / No: {noVotes.toString()}
              </Body>
            </div>
          </>
        )}
      </div>

      {!isExecuted && (
        <div className="flex gap-2">
          {canContest && (
            <LiftedButton onClick={handleContest} className="text-red-600!">
              Contest
            </LiftedButton>
          )}
          {canVote && (
            <>
              <LiftedButton onClick={() => handleVote(true)}>
                Vote Yes
              </LiftedButton>
              <LiftedButton
                onClick={() => handleVote(false)}
                className="text-red-600!"
              >
                Vote No
              </LiftedButton>
            </>
          )}
          {canExecute && (
            <LiftedButton onClick={handleExecute}>
              Execute Withdrawal
            </LiftedButton>
          )}
        </div>
      )}
    </div>
  );
}
