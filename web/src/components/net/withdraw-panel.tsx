"use client";

import { useId, useMemo, useState } from "react";
import { Caption } from "@breadcoop/ui";
import { Lightning, UsersThree } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Badge, Card } from "@/components/ui/ui";
import { useWithdraw } from "@/hooks/use-safety-net-writes";
import { useTokenInfo } from "@/hooks/use-token";
import { DAYS_IN_A_MONTH } from "@/lib/config";
import { formatAmount, formatDuration } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade";

/**
 * Withdraw by "days of income": amount = (monthly contribution × redeem
 * ratio ÷ 30) × days. Small amounts (≤ auto threshold) pay out instantly;
 * larger ones open a request the group can contest.
 */
export function WithdrawPanel({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);
  const { withdraw, status, hash, error, isBusy } = useWithdraw();
  const [days, setDays] = useState("");
  const daysId = useId();
  // Whether the submitted withdrawal was small (instant), captured at submit
  // time so the success message keeps describing the transaction that actually
  // ran even if the input changes afterwards.
  const [submittedSmall, setSubmittedSmall] = useState(false);

  const dailyAmount =
    (details.monthlyContribute * net.redeemRatio) / DAYS_IN_A_MONTH;

  const parsedDays = useMemo(() => {
    const n = Number(days);
    if (!days.trim() || !Number.isInteger(n) || n <= 0) return null;
    return BigInt(n);
  }, [days]);

  const amount = parsedDays !== null ? dailyAmount * parsedDays : null;
  const isSmall = amount !== null && amount <= net.autoThreshold;
  const exceedsBalance =
    amount !== null && amount > details.withdrawableBalance;
  const notOnboarded = details.monthlyContribute === 0n;

  return (
    <Card>
      <Caption className="text-surface-grey-2">Withdraw</Caption>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={daysId}>
              <Caption className="text-surface-grey-2">Days requested</Caption>
            </label>
            <span className="text-primary-jade text-xs font-medium">
              1 day = {formatAmount(dailyAmount, decimals)} {symbol}
            </span>
          </div>
          <input
            id={daysId}
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 7"
            aria-invalid={exceedsBalance || undefined}
            aria-describedby={`${daysId}-help`}
            className={`${inputClass} mt-1.5`}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <p id={`${daysId}-help`} className="text-surface-grey mt-1.5 text-xs">
            You withdraw in &quot;days of income&quot;: each day is worth your
            recurring deposit × the redeem ratio (×
            {net.redeemRatio.toString()}) ÷ 30.
          </p>
        </div>

        {amount !== null && (
          <div className="border-paper-2 bg-paper-main rounded-xl border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-surface-grey-2 text-sm">You receive</span>
              <span className="font-breadDisplay text-text-standard font-bold">
                {formatAmount(amount, decimals)} {symbol}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {isSmall ? (
                <Badge tone="green">
                  <Lightning size={12} weight="fill" /> instant
                </Badge>
              ) : (
                <Badge tone="warning">
                  <UsersThree size={12} weight="fill" /> group review
                </Badge>
              )}
              <span className="text-surface-grey text-xs">
                {isSmall
                  ? `≤ ${formatAmount(net.autoThreshold, decimals)} ${symbol} pays out immediately (max ${net.smallWithdrawsLimit.toString()}× per epoch)`
                  : `> ${formatAmount(net.autoThreshold, decimals)} ${symbol} opens a request members can contest for ${formatDuration(net.contestWindow)}`}
              </span>
            </div>
          </div>
        )}

        {exceedsBalance && (
          <p className="text-system-red text-xs font-medium">
            That exceeds your withdrawable balance of{" "}
            {formatAmount(details.withdrawableBalance, decimals)} {symbol}.
          </p>
        )}
        {notOnboarded && details.isMember && (
          <p className="text-system-warning text-xs font-medium">
            Pay your initial deposit first — you have nothing to withdraw yet.
          </p>
        )}

        <ActionButton
          onClick={() => {
            if (parsedDays === null) return;
            setSubmittedSmall(isSmall);
            withdraw(net.id, parsedDays);
          }}
          isLoading={isBusy}
          disabled={
            parsedDays === null ||
            exceedsBalance ||
            notOnboarded ||
            amount === 0n
          }
        >
          {amount !== null && !isSmall ? "Request withdrawal" : "Withdraw"}
        </ActionButton>
        <TxStatus
          status={status}
          hash={hash}
          error={error}
          successLabel={
            submittedSmall
              ? "Withdrawn"
              : "Request created — executable after the contest window"
          }
        />
      </div>
    </Card>
  );
}
