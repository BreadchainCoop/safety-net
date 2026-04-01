"use client";

import { useState } from "react";
import { LiftedButton, Body, Caption } from "@breadcoop/ui";
import { useSafetyNetTx } from "@/hooks/use-safety-net-tx";
import { useModal } from "@/components/modal/context";
import { formatBalance } from "@/utils/format";
import { useQueryClient } from "@tanstack/react-query";
import { parseContractError } from "@/lib/parse-contract-error";

interface WithdrawFormProps {
  fundId: bigint;
  fixedDeposit: bigint;
  redeemRatio: bigint;
  autoThreshold: bigint;
  withdrawableBalance: bigint;
}

export function WithdrawForm({
  fundId,
  fixedDeposit,
  redeemRatio,
  autoThreshold,
  withdrawableBalance,
}: WithdrawFormProps) {
  const [daysRequested, setDaysRequested] = useState("");
  const { sendSafetyNetTx } = useSafetyNetTx();
  const { setModal } = useModal();
  const queryClient = useQueryClient();

  const days = BigInt(daysRequested || "0");
  const withdrawAmount =
    days > 0n ? (fixedDeposit * redeemRatio * days) / 30n : 0n;
  const isSmall = withdrawAmount <= autoThreshold;

  const handleWithdraw = async () => {
    if (days === 0n) return;
    try {
      setModal({ type: "WITHDRAW_LOADING" });

      await sendSafetyNetTx({
        functionName: "withdraw",
        args: [fundId, days],
      });

      setModal({
        type: "WITHDRAW_RESULT",
        result: "success",
        msg: isSmall
          ? `Withdrawal of ${formatBalance(withdrawAmount)} auto-approved and executed.`
          : "Withdrawal request created. It can be contested by other members.",
      });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    } catch (e) {
      const { message, isUserRejection } = parseContractError(e, "Withdrawal failed");
      if (isUserRejection) { setModal(null); return; }
      setModal({
        type: "WITHDRAW_RESULT",
        result: "error",
        msg: message,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Caption>Withdrawable Balance</Caption>
        <Body>{formatBalance(withdrawableBalance)}</Body>
      </div>
      <div className="flex justify-between">
        <Caption>Auto-Approve Threshold</Caption>
        <Body>{formatBalance(autoThreshold)}</Body>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Days Requested
        </label>
        <input
          type="number"
          value={daysRequested}
          onChange={(e) => setDaysRequested(e.target.value)}
          min={1}
          placeholder="Number of days"
          className="input-field"
        />
      </div>

      {days > 0n && (
        <div className="p-3 bg-paper-1 rounded-lg space-y-1">
          <div className="flex justify-between">
            <Caption>Withdrawal Amount</Caption>
            <Body>{formatBalance(withdrawAmount)}</Body>
          </div>
          <div className="flex justify-between">
            <Caption>Path</Caption>
            <Body className={isSmall ? "text-green-600" : "text-amber-600"}>
              {isSmall ? "Auto-approved" : "Requires contest window"}
            </Body>
          </div>
        </div>
      )}

      <LiftedButton
        width="full"
        onClick={handleWithdraw}
        disabled={days === 0n}
      >
        Request Withdrawal
      </LiftedButton>
    </div>
  );
}
