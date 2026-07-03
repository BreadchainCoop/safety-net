"use client";

import { Caption } from "@breadcoop/ui";
import { AddressDisplay } from "@/components/ui/address-display";
import { Card, InfoRow, ProgressBar, StatCard } from "@/components/ui/ui";
import { useNow } from "@/hooks/use-now";
import { useTokenInfo } from "@/hooks/use-token";
import { useSafetyNetName } from "@/hooks/use-safety-net";
import { formatAmount, formatDateTime, formatDuration } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

/** Headline stats + epoch progress + the net's configured rules. */
export function NetOverview({ details }: { details: SafetyNetDetails }) {
  const now = useNow();
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);
  const { data: name } = useSafetyNetName(net.id);

  // safetyNetStart is 0 until the owner calls start() (then it's stamped
  // with the block timestamp), so a nonzero start means "running".
  const started = net.safetyNetStart !== 0n;
  const start = Number(net.safetyNetStart);
  const epochDuration = Number(net.epochDuration);
  const epochIndex = Number(details.currentEpochIndex);
  const epochStart = start + epochIndex * epochDuration;
  const epochProgress = started
    ? Math.min(1, (now - epochStart) / epochDuration)
    : 0;
  const epochEndsIn = started ? epochStart + epochDuration - now : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Pool balance"
          value={`${formatAmount(details.totalBalance, decimals)} ${symbol}`}
        />
        <StatCard
          label="My withdrawable"
          value={`${formatAmount(details.withdrawableBalance, decimals)} ${symbol}`}
          sub={details.isMember ? "1:1 with your deposits" : "not a member"}
          accent={details.isMember}
        />
        <StatCard
          label="Members"
          value={details.memberCount.toString()}
          sub={`min ${net.minimumMembers.toString()} / max ${net.maximumMembers.toString()}`}
        />
        <StatCard
          label="My dues this epoch"
          value={
            !started
              ? "Not started"
              : details.isMember
                ? details.duesRemaining > 0n
                  ? `${formatAmount(details.duesRemaining, decimals)} ${symbol}`
                  : "Paid ✓"
                : "—"
          }
          sub={
            started
              ? `of ${formatAmount(net.fixedDeposit, decimals)} ${symbol} recurring`
              : `dues begin with epoch 1 (${formatAmount(net.fixedDeposit, decimals)} ${symbol} recurring)`
          }
        />
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <Caption className="text-surface-grey-2">
            {started
              ? `Epoch ${epochIndex} — ends ${formatDuration(epochEndsIn)} from now`
              : "Not started — epochs begin when the owner starts the net"}
          </Caption>
          <Caption className="text-surface-grey">
            {formatDuration(epochDuration)} per epoch
          </Caption>
        </div>
        <div className="mt-3">
          <ProgressBar value={epochProgress} />
        </div>
      </Card>

      <Card>
        <Caption className="text-surface-grey-2">Rules</Caption>
        <div className="mt-2">
          {name && <InfoRow label="Name">{name}</InfoRow>}
          <InfoRow label="Token">
            {symbol} <AddressDisplay address={net.token} />
          </InfoRow>
          <InfoRow label="Owner">
            <AddressDisplay address={net.owner} />
          </InfoRow>
          <InfoRow
            label="Initial deposit"
            help="One-off joining payment — a member's first deposit must be exactly this."
          >
            {formatAmount(net.initialDeposit, decimals)} {symbol}
          </InfoRow>
          <InfoRow
            label="Recurring deposit"
            help="Dues owed by each member every epoch. Partial payments are fine, and anything extra prepays future epochs (up to 12 ahead)."
          >
            {formatAmount(net.fixedDeposit, decimals)} {symbol} / epoch
          </InfoRow>
          <InfoRow
            label="Redeem ratio"
            help="Fixed at ×1 in v1: every token deposited is exactly one token of withdrawable balance — deposits and withdrawal power are 1:1."
          >
            ×{net.redeemRatio.toString()}
          </InfoRow>
          <InfoRow
            label="Instant withdrawals"
            help="Withdrawals up to this amount are paid instantly; larger ones create a contestable request."
          >
            ≤ {formatAmount(net.autoThreshold, decimals)} {symbol}, max{" "}
            {net.smallWithdrawsLimit.toString()}× per epoch
          </InfoRow>
          <InfoRow
            label="Contest rule"
            help="A large withdrawal is vetoed when more than this share of members contest it within the window."
          >
            &gt;{net.contestThreshold.toString()}% of members within{" "}
            {formatDuration(net.contestWindow)}
          </InfoRow>
          <InfoRow label="Started">
            {started ? formatDateTime(net.safetyNetStart) : "Not started yet"}
          </InfoRow>
        </div>
      </Card>
    </div>
  );
}
