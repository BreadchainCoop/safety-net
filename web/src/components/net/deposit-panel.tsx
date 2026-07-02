"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, isAddress, type Address } from "viem";
import { Caption } from "@breadcoop/ui";
import { ActionButton } from "@/components/ui/action-button";
import { AmountField } from "@/components/ui/amount-field";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { useMemberDepositInfo } from "@/hooks/use-safety-net";
import { useDeposit, useDepositFor } from "@/hooks/use-safety-net-writes";
import {
  useAllowance,
  useApprove,
  useTokenBalance,
  useTokenInfo,
} from "@/hooks/use-token";
import { formatAmount, parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SafetyNetDetails } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade";

/**
 * Approve → deposit state machine (crowdstake.fun pattern). Handles both the
 * exact initial deposit for onboarding members and partial recurring
 * payments, for yourself or for another member.
 *
 * Note: `depositFor` only covers the gas — the contract pulls tokens from the
 * *member* being deposited for, so their allowance/balance is what matters.
 */
export function DepositPanel({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);

  const [mode, setMode] = useState<"self" | "other">("self");
  const [otherMember, setOtherMember] = useState("");
  const [amount, setAmount] = useState("");

  const beneficiary: Address | undefined =
    mode === "self"
      ? address
      : isAddress(otherMember)
        ? otherMember
        : undefined;

  // Onboarding/dues state for the beneficiary. For "self" we already have it
  // in the aggregate details; for another member we read it separately.
  const other = useMemberDepositInfo(
    mode === "other" ? net.id : undefined,
    mode === "other" ? beneficiary : undefined,
  );
  const isMember = mode === "self" ? details.isMember : other.isMember;
  const monthlyContribute =
    mode === "self" ? details.monthlyContribute : other.monthlyContribute;
  const duesRemaining =
    mode === "self" ? details.duesRemaining : other.duesRemaining;
  const onboarding =
    monthlyContribute !== undefined && monthlyContribute === 0n;

  // Funds always leave the *beneficiary's* wallet.
  const { data: balance } = useTokenBalance(net.token, beneficiary);
  const { data: allowance, refetch: refetchAllowance } = useAllowance(
    net.token,
    beneficiary,
  );

  const approveTx = useApprove();
  const depositTx = useDeposit();
  const depositForTx = useDepositFor();

  // Onboarding deposits must be exactly the initial deposit.
  useEffect(() => {
    if (onboarding) setAmount(formatUnits(net.initialDeposit, decimals));
  }, [onboarding, net.initialDeposit, decimals]);

  const parsed = useMemo(
    () => (onboarding ? net.initialDeposit : parseAmount(amount, decimals)),
    [onboarding, net.initialDeposit, amount, decimals],
  );

  const needsApproval =
    parsed !== null && parsed > 0n && (allowance ?? 0n) < parsed;
  const insufficientBalance =
    parsed !== null && balance !== undefined && balance < parsed;
  const exceedsDues =
    !onboarding &&
    parsed !== null &&
    duesRemaining !== undefined &&
    parsed > duesRemaining;

  useEffect(() => {
    if (approveTx.isSuccess) refetchAllowance();
  }, [approveTx.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (depositTx.isSuccess || depositForTx.isSuccess) setAmount("");
  }, [depositTx.isSuccess, depositForTx.isSuccess]);

  const activeTx =
    needsApproval && mode === "self"
      ? approveTx
      : mode === "self"
        ? depositTx
        : depositForTx;

  const submit = () => {
    if (parsed === null || parsed === 0n || !beneficiary) return;
    if (mode === "self") {
      if (needsApproval) approveTx.approve(net.token, parsed);
      else depositTx.deposit(net.id, parsed);
    } else {
      depositForTx.depositFor(net.id, parsed, beneficiary);
    }
  };

  const disabled =
    parsed === null ||
    parsed === 0n ||
    !beneficiary ||
    isMember === false ||
    insufficientBalance ||
    exceedsDues ||
    (mode === "other" && needsApproval);

  const buttonLabel =
    mode === "self" && needsApproval
      ? `Approve ${symbol}`
      : onboarding
        ? `Pay initial deposit (${formatAmount(net.initialDeposit, decimals)} ${symbol})`
        : "Deposit";

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Caption className="text-surface-grey-2">Deposit</Caption>
        <div className="bg-paper-2 flex rounded-lg p-0.5 text-xs font-bold">
          {(
            [
              ["self", "My dues"],
              ["other", "For a member"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                mode === value
                  ? "bg-paper-0 text-primary-jade shadow-sm"
                  : "text-surface-grey-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {mode === "other" && (
          <div>
            <Caption className="text-surface-grey-2">Member address</Caption>
            <input
              className={`${inputClass} mt-1.5`}
              placeholder="0x… member to pay dues for"
              value={otherMember}
              onChange={(e) => setOtherMember(e.target.value)}
            />
            {otherMember && !isAddress(otherMember) && (
              <p className="text-system-red mt-1 text-xs">Invalid address</p>
            )}
            {beneficiary && isMember === false && (
              <p className="text-system-red mt-1 text-xs">
                That address is not a member of this Safety Net.
              </p>
            )}
          </div>
        )}

        <AmountField
          label={onboarding ? "Initial deposit (fixed)" : "Amount"}
          value={amount}
          onChange={setAmount}
          balance={onboarding ? undefined : duesRemaining}
          balanceLabel="Dues left"
          symbol={symbol}
          decimals={decimals}
          disabled={onboarding}
          help={
            onboarding
              ? "First deposit: pay exactly the initial deposit in one payment to activate membership."
              : duesRemaining === 0n
                ? "All paid up — deposits reopen next epoch."
                : "Partial payments are fine, up to your remaining dues for this epoch."
          }
        />

        {insufficientBalance && (
          <p className="text-system-red text-xs font-medium">
            {mode === "self" ? "Your" : "The member's"} {symbol} balance (
            {formatAmount(balance, decimals)}) doesn&apos;t cover this deposit.
          </p>
        )}
        {exceedsDues && (
          <p className="text-system-red text-xs font-medium">
            That exceeds the {formatAmount(duesRemaining, decimals)} {symbol}{" "}
            still owed this epoch.
          </p>
        )}
        {mode === "other" && needsApproval && parsed !== null && (
          <p className="text-system-warning text-xs font-medium">
            Deposits pull tokens from the member&apos;s own wallet — they must
            first approve the SafetyNet contract for at least{" "}
            {formatAmount(parsed, decimals)} {symbol}.
          </p>
        )}

        <ActionButton
          onClick={submit}
          isLoading={activeTx.isBusy}
          disabled={disabled}
        >
          {buttonLabel}
        </ActionButton>
        <TxStatus
          status={activeTx.status}
          hash={activeTx.hash}
          error={activeTx.error}
          successLabel={
            activeTx === approveTx ? "Approved — now deposit" : "Deposited"
          }
        />
      </div>
    </Card>
  );
}
