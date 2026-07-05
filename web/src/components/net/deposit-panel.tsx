"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, isAddress, type Address } from "viem";
import { Caption } from "@breadcoop/ui";
import { ActionButton } from "@/components/ui/action-button";
import { AmountField } from "@/components/ui/amount-field";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { NoteBox } from "@/components/ui/note-box";
import { GetBreadModal } from "@/components/funding/get-bread-modal";
import { useMemberDepositInfo } from "@/hooks/use-safety-net";
import { useDeposit, useDepositFor } from "@/hooks/use-safety-net-writes";
import {
  useAllowance,
  useApprove,
  useTokenBalance,
  useTokenInfo,
} from "@/hooks/use-token";
import { BREAD_ADDRESS, MAX_PREPAY_EPOCHS } from "@/lib/config";
import { formatAmount, parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SafetyNetDetails } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade";

const APPROVE_PREF_KEY = "safetynet.approveUnlimited";

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/**
 * Live preview of how the contract will allocate a recurring deposit:
 * this epoch's remaining dues first, then future epochs (prepay), each up to
 * fixedDeposit. Assumes future epochs aren't already prepaid — the contract
 * reverts with ExceedsDepositAmount if the value can't be fully allocated.
 */
function describeAllocation(
  amount: bigint,
  duesRemaining: bigint,
  fixedDeposit: bigint,
  decimals: number,
  symbol: string,
): string {
  if (amount <= duesRemaining) {
    if (amount === duesRemaining) return "Covers the rest of this epoch's dues.";
    return `Goes toward this epoch's dues — ${formatAmount(duesRemaining - amount, decimals)} ${symbol} will still be due.`;
  }
  const excess = amount - duesRemaining;
  const fullEpochs = fixedDeposit > 0n ? Number(excess / fixedDeposit) : 0;
  const partial = fixedDeposit > 0n ? excess % fixedDeposit : 0n;
  const base =
    duesRemaining > 0n
      ? "Covers this epoch's dues"
      : "This epoch is already paid";

  if (fullEpochs === 0)
    return `${base} + prepays ${formatAmount(partial, decimals)} ${symbol} toward the next epoch.`;
  const epochs = `${fullEpochs} future epoch${fullEpochs === 1 ? "" : "s"}`;
  if (partial === 0n) return `${base} + prepays ${epochs} in full.`;
  return `${base} + prepays ${epochs} (${formatAmount(partial, decimals)} ${symbol} toward the ${ordinal(fullEpochs + 1)}).`;
}

/**
 * Approve → deposit state machine (crowdstake.fun pattern). Handles the exact
 * initial deposit for onboarding members and recurring payments — including
 * prepaying future epochs — for yourself or for another member.
 *
 * Note: `depositFor` only covers the gas — the contract pulls tokens from the
 * *member* being deposited for, so their allowance/balance is what matters.
 */
export function DepositPanel({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);
  const otherInputId = useId();
  const approvePrefId = useId();

  const [mode, setMode] = useState<"self" | "other">("self");
  const [otherMember, setOtherMember] = useState("");
  const [amount, setAmount] = useState("");
  const [getBreadOpen, setGetBreadOpen] = useState(false);
  // Approve unlimited once (reference default) vs the exact amount each time.
  // Remembered per browser in localStorage.
  const [approveUnlimited, setApproveUnlimited] = useState(true);

  useEffect(() => {
    try {
      setApproveUnlimited(localStorage.getItem(APPROVE_PREF_KEY) !== "exact");
    } catch {
      // storage unavailable — keep the default
    }
  }, []);

  const setApprovePref = (unlimited: boolean) => {
    setApproveUnlimited(unlimited);
    try {
      localStorage.setItem(APPROVE_PREF_KEY, unlimited ? "unlimited" : "exact");
    } catch {
      // storage unavailable — preference lasts for the session
    }
  };

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
  // The user can only top themselves up. Offer "Get BREAD" when they're short
  // on a BREAD-denominated net and depositing for themselves.
  const isBreadNet =
    net.token.toLowerCase() === BREAD_ADDRESS.toLowerCase();
  const canGetBread =
    mode === "self" && isBreadNet && insufficientBalance === true;
  // Upper bound on what the prepay window can absorb: this epoch's remaining
  // dues + MAX_PREPAY_EPOCHS full epochs. (Future-epoch fills can't be read
  // cheaply, so a deposit inside this bound can still revert with
  // ExceedsDepositAmount when epochs are already prepaid — the error copy
  // explains that case.)
  const maxCapacity =
    duesRemaining !== undefined
      ? duesRemaining + MAX_PREPAY_EPOCHS * net.fixedDeposit
      : undefined;
  const exceedsCapacity =
    !onboarding &&
    parsed !== null &&
    maxCapacity !== undefined &&
    parsed > maxCapacity;

  const allocationPreview =
    !onboarding &&
    parsed !== null &&
    parsed > 0n &&
    duesRemaining !== undefined &&
    !exceedsCapacity
      ? describeAllocation(
          parsed,
          duesRemaining,
          net.fixedDeposit,
          decimals,
          symbol,
        )
      : null;

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
      if (needsApproval)
        approveTx.approve(
          net.token,
          approveUnlimited ? undefined : parsed,
        );
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
    exceedsCapacity ||
    (mode === "other" && needsApproval);

  const buttonLabel =
    mode === "self" && needsApproval
      ? approveUnlimited
        ? `Approve ${symbol}`
        : `Approve ${parsed !== null ? formatAmount(parsed, decimals) : ""} ${symbol}`
      : onboarding
        ? `Pay initial deposit (${formatAmount(net.initialDeposit, decimals)} ${symbol})`
        : "Deposit";

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Caption className="text-surface-grey-2">Deposit</Caption>
        <div
          role="group"
          aria-label="Who are you depositing for?"
          className="bg-paper-2 flex rounded-lg p-0.5 text-xs font-bold"
        >
          {(
            [
              ["self", "My dues"],
              ["other", "For a member"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
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
        {onboarding && mode === "self" && (
          <NoteBox icon>
            <strong className="text-text-standard">
              First deposit — your join payment.
            </strong>{" "}
            Pay exactly {formatAmount(net.initialDeposit, decimals)} {symbol} once
            to activate your membership. It sets your recurring dues and unlocks
            withdrawals. Your deposit stays yours.
          </NoteBox>
        )}
        {mode === "other" && (
          <div>
            <label htmlFor={otherInputId}>
              <Caption className="text-surface-grey-2">Member address</Caption>
            </label>
            <input
              id={otherInputId}
              className={`${inputClass} mt-1.5`}
              placeholder="0x… member to pay dues for"
              value={otherMember}
              aria-invalid={
                (otherMember !== "" && !isAddress(otherMember)) || undefined
              }
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
          error={insufficientBalance || exceedsCapacity}
          help={
            onboarding
              ? "First deposit: pay exactly the initial deposit in one payment to activate membership."
              : duesRemaining === 0n
                ? "All paid up for this epoch — extra deposits prepay future epochs (up to 12 ahead)."
                : "Partial payments are fine. Anything beyond this epoch's dues prepays future epochs (up to 12 ahead)."
          }
        />

        {allocationPreview && (
          <p
            role="status"
            aria-live="polite"
            className="text-primary-jade text-xs font-medium"
          >
            {allocationPreview}
          </p>
        )}

        {insufficientBalance && (
          <p className="text-system-red text-xs font-medium">
            {mode === "self" ? "Your" : "The member's"} {symbol} balance (
            {formatAmount(balance, decimals)}) doesn&apos;t cover this deposit.
          </p>
        )}
        {canGetBread && (
          <button
            type="button"
            onClick={() => setGetBreadOpen(true)}
            className="border-primary-jade text-primary-jade hover:bg-primary-jade/10 self-start rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors"
          >
            Not enough BREAD — Get BREAD
          </button>
        )}
        {exceedsCapacity && (
          <p className="text-system-red text-xs font-medium">
            That&apos;s more than this epoch&apos;s dues plus{" "}
            {MAX_PREPAY_EPOCHS.toString()} epochs of prepay — the most that can
            be deposited now is {formatAmount(maxCapacity, decimals)} {symbol}.
          </p>
        )}
        {mode === "other" && needsApproval && parsed !== null && (
          <p className="text-system-warning text-xs font-medium">
            Deposits pull tokens from the member&apos;s own wallet — they must
            first approve the SafetyNet contract for at least{" "}
            {formatAmount(parsed, decimals)} {symbol}.
          </p>
        )}

        {mode === "self" && needsApproval && (
          <label
            htmlFor={approvePrefId}
            className="text-surface-grey-2 flex items-center gap-2 text-xs font-medium"
          >
            <input
              id={approvePrefId}
              type="checkbox"
              checked={approveUnlimited}
              onChange={(e) => setApprovePref(e.target.checked)}
              className="accent-primary-jade h-3.5 w-3.5"
            />
            Approve once for all future deposits (recommended — dues recur
            every epoch)
          </label>
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
      <GetBreadModal
        open={getBreadOpen}
        onClose={() => setGetBreadOpen(false)}
      />
    </Card>
  );
}
