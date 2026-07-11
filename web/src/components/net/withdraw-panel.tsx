"use client";

import { useId, useMemo, useState } from "react";
import { Caption } from "@breadcoop/ui";
import { Lightning, UsersThree } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Badge, Card } from "@/components/ui/ui";
import { Slider } from "@/components/ui/slider-field";
import { useWithdraw } from "@/hooks/use-safety-net-writes";
import { useTokenInfo } from "@/hooks/use-token";
import { DAYS_IN_A_MONTH } from "@/lib/config";
import { formatAmount, formatDuration } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade";

// UI cap on reasons (the contract caps at MAX_REASON_BYTES = 2000 UTF-8 bytes).
const MAX_REASON_WORDS = 200;
const MAX_REASON_BYTES = 2000;

const countWords = (s: string): number =>
  s.trim() === "" ? 0 : s.trim().split(/\s+/).length;

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/**
 * Withdraw by "days of support": amount = (monthly contribution × the member's
 * EFFECTIVE support ratio ÷ 30) × days. The effective ratio is the configured
 * ratio throttled by the contract's actuarial caps (group size + pool runway),
 * so the preview always matches what a withdrawal would pay right now. Small
 * amounts (≤ the petty-cash threshold) pay out instantly; larger ones open a
 * request the group can contest.
 */
export function WithdrawPanel({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);
  const { withdraw, status, hash, error, isBusy } = useWithdraw();
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const daysId = useId();
  const reasonId = useId();
  // Whether the submitted withdrawal was small (instant), captured at submit
  // time so the success message keeps describing the transaction that actually
  // ran even if the input changes afterwards.
  const [submittedSmall, setSubmittedSmall] = useState(false);

  const effectiveRatio = details.effectiveRedeemRatio;
  const dailyAmount =
    (details.monthlyContribute * effectiveRatio) / DAYS_IN_A_MONTH;
  const monthlySupport = details.monthlyContribute * effectiveRatio;
  const maxDays =
    dailyAmount > 0n ? Number(details.withdrawableBalance / dailyAmount) : 0;

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

  // A reason is only required/shown for LARGE withdrawals (those that open a
  // request); small/instant withdrawals pass "".
  const needsReason = amount !== null && !isSmall;
  const reasonWords = countWords(reason);
  const reasonBytes = byteLength(reason);
  const reasonTooLong =
    reasonWords > MAX_REASON_WORDS || reasonBytes > MAX_REASON_BYTES;

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
              ×{effectiveRatio.toString()} support ≈{" "}
              {formatAmount(monthlySupport, decimals)} {symbol}/month · 1 day ={" "}
              {formatAmount(dailyAmount, decimals)} {symbol}
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
          <Slider
            min={1}
            max={Math.max(1, maxDays)}
            step={1}
            value={Number(days) || 1}
            onChange={(v) => setDays(String(v))}
            disabled={notOnboarded || maxDays === 0}
            ariaLabel="Days requested slider"
            className="mt-3"
          />
          <p id={`${daysId}-help`} className="text-surface-grey mt-1.5 text-xs">
            You withdraw in &quot;days of support&quot;: each day is worth your
            monthly contribution × your current support ratio (×
            {effectiveRatio.toString()}
            {effectiveRatio < net.redeemRatio
              ? ` right now, of ×${net.redeemRatio.toString()} configured — the rate grows with the group and its pool`
              : ""}
            ) ÷ 30. Your balance covers up to {maxDays} day
            {maxDays === 1 ? "" : "s"}.
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
                  ? `Petty cash: up to ${formatAmount(net.autoThreshold, decimals)} ${symbol} pays out instantly, no review (max ${net.smallWithdrawsLimit.toString()}× per epoch)`
                  : `Over the ${formatAmount(net.autoThreshold, decimals)} ${symbol} petty-cash threshold — opens a request members can contest for ${formatDuration(net.contestWindow)}`}
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

        {needsReason && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={reasonId}>
                <Caption className="text-surface-grey-2">
                  Why do you need this? (shown to all members)
                </Caption>
              </label>
              <span
                className={`text-xs font-medium ${
                  reasonTooLong ? "text-system-red" : "text-surface-grey"
                }`}
              >
                {reasonWords} / {MAX_REASON_WORDS} words
              </span>
            </div>
            <textarea
              id={reasonId}
              rows={3}
              placeholder="Explain your request so the group can decide whether to contest it…"
              aria-invalid={reasonTooLong || undefined}
              aria-describedby={
                reasonTooLong
                  ? `${reasonId}-help ${reasonId}-error`
                  : `${reasonId}-help`
              }
              className={`${inputClass} mt-1.5 resize-y`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p
              id={`${reasonId}-help`}
              className="text-surface-grey mt-1.5 text-xs"
            >
              This reason is stored on-chain and visible to everyone in the
              group. Keep it under {MAX_REASON_WORDS} words.
            </p>
            {reasonTooLong && (
              <p
                id={`${reasonId}-error`}
                className="text-system-red mt-1 text-xs font-medium"
              >
                {reasonWords > MAX_REASON_WORDS
                  ? `Too long — remove ${reasonWords - MAX_REASON_WORDS} word${reasonWords - MAX_REASON_WORDS === 1 ? "" : "s"}.`
                  : "Too long — please shorten it (max 2000 bytes)."}
              </p>
            )}
          </div>
        )}

        <ActionButton
          onClick={() => {
            if (parsedDays === null) return;
            setSubmittedSmall(isSmall);
            withdraw(net.id, parsedDays, needsReason ? reason.trim() : "");
          }}
          isLoading={isBusy}
          disabled={
            parsedDays === null ||
            exceedsBalance ||
            notOnboarded ||
            amount === 0n ||
            (needsReason && reasonTooLong)
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
