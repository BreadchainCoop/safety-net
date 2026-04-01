"use client";

import { useState } from "react";
import { LiftedButton, Body } from "@breadcoop/ui";
import { useConnectedUser } from "@breadcoop/ui";
import { parseUnits, Address, maxUint256, encodeFunctionData } from "viem";
import { useReadContract } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { erc20Abi } from "@/lib/abis/erc20";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { useSafetyNetTx } from "@/hooks/use-safety-net-tx";
import { useSponsoredTx } from "@/hooks/use-sponsored-tx";
import { useWaitForTxReceipt } from "@/hooks/use-wait-for-tx-receipt";
import { useModal } from "@/components/modal/context";
import { formatBalance } from "@/utils/format";
import { useQueryClient } from "@tanstack/react-query";
import { parseContractError } from "@/lib/parse-contract-error";

interface DepositButtonProps {
  fundId: bigint;
  tokenAddress: Address;
  fixedDeposit: bigint;
  initialDeposit: bigint;
  duesRemaining: bigint;
  isFirstDeposit: boolean;
}

export function DepositButton({
  fundId,
  tokenAddress,
  fixedDeposit,
  initialDeposit,
  duesRemaining,
  isFirstDeposit,
}: DepositButtonProps) {
  const { user } = useConnectedUser();
  const { setModal } = useModal();
  const { sendSafetyNetTx } = useSafetyNetTx();
  const { sendSponsoredTransaction } = useSponsoredTx();
  const { waitForTxReceipt } = useWaitForTxReceipt();
  const queryClient = useQueryClient();
  const chainId = getDefaultChainId();
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const address = user.status === "CONNECTED" ? user.address : undefined;

  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address as Address, SAFETY_NET_ADDRESS] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  const handleDeposit = async () => {
    if (!address) return;

    let depositAmount: bigint;
    if (isFirstDeposit) {
      depositAmount = initialDeposit;
    } else if (showCustom && customAmount) {
      try {
        depositAmount = parseUnits(customAmount, 18);
      } catch {
        setModal({ type: "DEPOSIT_RESULT", result: "error", msg: "Invalid amount" });
        return;
      }
    } else {
      depositAmount = duesRemaining;
    }
    try {
      setModal({
        type: "DEPOSIT_INIT",
        amount: depositAmount,
        tokenAddress,
        fundId,
      });

      // Approve if needed
      if (allowance !== undefined && allowance < depositAmount) {
        setModal({ type: "DEPOSIT_LOADING", step: "approving" });
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SAFETY_NET_ADDRESS, maxUint256],
        });
        const { hash } = await sendSponsoredTransaction({
          to: tokenAddress,
          data: approveData,
        });
        await waitForTxReceipt(hash);
      }

      setModal({ type: "DEPOSIT_LOADING", step: "depositing" });

      await sendSafetyNetTx({
        functionName: "deposit",
        args: [fundId, depositAmount],
      });

      setModal({
        type: "DEPOSIT_RESULT",
        result: "success",
        msg: `Successfully deposited ${formatBalance(depositAmount)} tokens.`,
      });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    } catch (e) {
      const { message, isUserRejection } = parseContractError(e, "Deposit failed");
      if (isUserRejection) { setModal(null); return; }
      setModal({
        type: "DEPOSIT_RESULT",
        result: "error",
        msg: message,
      });
    }
  };

  if (duesRemaining === 0n && !isFirstDeposit) {
    return (
      <div className="p-4 bg-green-50 rounded-lg">
        <Body className="text-green-700">
          All dues paid for this epoch.
        </Body>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Body>
          {isFirstDeposit
            ? `Initial deposit: ${formatBalance(initialDeposit)}`
            : `Dues remaining: ${formatBalance(duesRemaining)}`}
        </Body>
      </div>

      {!isFirstDeposit && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showCustom}
              onChange={(e) => setShowCustom(e.target.checked)}
            />
            <Body className="text-sm">Custom amount</Body>
          </label>
          {showCustom && (
            <input
              type="text"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Amount"
              className="input-field w-32"
            />
          )}
        </div>
      )}

      <LiftedButton width="full" onClick={handleDeposit}>
        {isFirstDeposit ? "Make Initial Deposit" : "Deposit"}
      </LiftedButton>
    </div>
  );
}
