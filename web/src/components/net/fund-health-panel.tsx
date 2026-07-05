"use client";

import { Caption } from "@breadcoop/ui";
import { Card, InfoRow, ProgressBar, Badge, type BadgeTone } from "@/components/ui/ui";
import { NoteBox } from "@/components/ui/note-box";
import { useMembersNeedingDeposit } from "@/hooks/use-safety-net";
import { useTokenInfo } from "@/hooks/use-token";
import { formatAmount } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * Fund-health panel: turns the abstract solidarity math into a trust signal —
 * how many months of a member's support the pool can sustain, how far the
 * effective support ratio has ramped toward the configured one, and whether
 * anyone is behind on dues (which makes the net decommissionable). All computed
 * from getSafetyNetDetails + the already-available needs-deposit read; no new
 * contract surface. Shown on started nets only (a pending net has no runway).
 */
export function FundHealthPanel({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);
  const { data: needing } = useMembersNeedingDeposit(net.id);

  const configured = net.redeemRatio;
  const effective = details.effectiveRedeemRatio;
  const ramp =
    configured > 0n ? Number(effective) / Number(configured) : 1;

  // Reserve proxy: if one member drew their FULL monthly support, how many
  // months could today's pool sustain it? monthly = recurring dues × effective
  // support ratio. 6 months is the actuarial anchor (see contract POOL_RUNWAY).
  const monthlySupport = net.fixedDeposit * effective;
  const runwayMonths =
    monthlySupport > 0n ? Number(details.totalBalance) / Number(monthlySupport) : 0;
  const runwayTone: BadgeTone =
    runwayMonths >= 6 ? "green" : runwayMonths >= 3 ? "warning" : "red";
  const runwayLabel =
    runwayMonths >= 6 ? "Healthy" : runwayMonths >= 3 ? "Building" : "Thin";

  const overdue = needing?.length ?? 0;
  const memberCount = Number(details.memberCount);
  const paymentsHealthy = overdue === 0 && !details.isDecommissionable;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Caption className="text-surface-grey-2">Fund health</Caption>
        <Badge tone={runwayTone}>{runwayLabel}</Badge>
      </div>

      <div className="mt-4">
        <InfoRow
          label="Pool runway"
          help="A simple solvency check: if one member drew their full monthly support right now, roughly how many months could the current pool sustain it? Six months or more is comfortable. It's an illustration of the pool's depth, not a guarantee."
        >
          <span className="inline-flex items-center gap-2">
            ~{runwayMonths.toFixed(1)} months
            <Badge tone={runwayTone}>{runwayLabel}</Badge>
          </span>
        </InfoRow>

        <InfoRow
          label="Support ratio"
          help="Members draw support at the EFFECTIVE ratio, which ramps toward the configured ratio as the pool fills and the group grows. A new net starts low; a full, healthy group reaches the configured rate."
        >
          ×{effective.toString()}
          {effective < configured ? (
            <span className="text-surface-grey">
              {" "}
              of ×{configured.toString()}
            </span>
          ) : (
            ""
          )}
        </InfoRow>

        {effective < configured && (
          <div className="py-2">
            <div className="flex items-center justify-between gap-2">
              <Caption className="text-surface-grey-2">
                Effective ratio ramp
              </Caption>
              <Caption className="text-surface-grey">
                {Math.round(ramp * 100)}%
              </Caption>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={ramp} />
            </div>
          </div>
        )}

        <InfoRow
          label="Member payments"
          help="Whether every member is current on their dues this epoch. A member who falls behind lets anyone wind the net down, so staying paid up keeps the pool intact."
        >
          {paymentsHealthy ? (
            <span className="inline-flex items-center gap-2">
              All paid up
              <Badge tone="green">✓</Badge>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              {overdue > 0 ? `${overdue} of ${memberCount} behind` : "At risk"}
              <Badge tone="warning">check dues</Badge>
            </span>
          )}
        </InfoRow>
      </div>

      {details.isDecommissionable && (
        <div className="mt-3">
          <NoteBox tone="warning" icon>
            <strong className="text-text-standard">
              This net can be wound down now.
            </strong>{" "}
            A member is behind on dues, so any member can decommission it —
            everyone gets their withdrawable balance back plus an even split of
            whatever&apos;s left in the pool.
          </NoteBox>
        </div>
      )}

      <p className="text-surface-grey mt-3 text-xs">
        Runway assumes one member drawing full support from{" "}
        {formatAmount(details.totalBalance, decimals)} {symbol} pooled. It&apos;s
        an illustration of the pool&apos;s depth, not a promise of any payout.
      </p>
    </Card>
  );
}
